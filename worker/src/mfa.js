const encoder = new TextEncoder();
const MFA_PREFIX = "admin.mfa.";
const FAIL_PREFIX = "admin.mfa.fail.";
const MFA_PERIOD_SECONDS = 30;
const MFA_WINDOW = 1;
const MFA_MAX_FAILURES = 5;
const MFA_LOCK_SECONDS = 15 * 60;

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base32Encode(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let output = [];
  let buffer = 0;
  let bits = 0;
  for (const character of value.toUpperCase().replace(/=+$/g, "")) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("invalid_totp_secret");
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

function settingKey(email) { return `${MFA_PREFIX}${email.toLowerCase()}`; }
function failKey(email) { return `${FAIL_PREFIX}${email.toLowerCase()}`; }

async function readSetting(db, key) {
  const row = await db.prepare("SELECT value_json FROM admin_settings WHERE key = ?").bind(key).first();
  if (!row) return null;
  try { return JSON.parse(row.value_json); } catch { return null; }
}

async function writeSetting(db, key, value, actor) {
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO admin_settings(key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
    .bind(key, JSON.stringify(value), now, actor).run();
}

async function deleteSetting(db, key) {
  await db.prepare("DELETE FROM admin_settings WHERE key = ?").bind(key).run();
}

async function encryptionKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("missing_session_secret");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`uma-admin-mfa\0${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptTotpSecret(secret, email, signingSecret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(email.toLowerCase()) }, await encryptionKey(signingSecret), encoder.encode(secret));
  return { iv: base64url(iv), ciphertext: base64url(new Uint8Array(ciphertext)) };
}

export async function decryptTotpSecret(record, email, signingSecret) {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64url(record.iv), additionalData: encoder.encode(email.toLowerCase()) }, await encryptionKey(signingSecret), fromBase64url(record.ciphertext));
  return new TextDecoder().decode(plaintext);
}

export async function getMfaRecord(db, email) {
  return readSetting(db, settingKey(email));
}

export async function saveMfaRecord(db, email, record) {
  return writeSetting(db, settingKey(email), record, email);
}

export async function updateMfaRecordOnce(db, email, previous, next) {
  const result = await db.prepare("UPDATE admin_settings SET value_json = ?, updated_at = ?, updated_by = ? WHERE key = ? AND value_json = ?")
    .bind(JSON.stringify(next), new Date().toISOString(), email, settingKey(email), JSON.stringify(previous)).run();
  return Boolean(result.meta?.changes);
}

export async function getPendingEnrollment(db, email) {
  return readSetting(db, `${MFA_PREFIX}pending.${email.toLowerCase()}`);
}

export async function savePendingEnrollment(db, email, record) {
  return writeSetting(db, `${MFA_PREFIX}pending.${email.toLowerCase()}`, record, email);
}

export async function clearPendingEnrollment(db, email) {
  return deleteSetting(db, `${MFA_PREFIX}pending.${email.toLowerCase()}`);
}

export function createTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

function equalCode(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function totpAt(secret, counter) {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const message = new Uint8Array(8);
  let remainder = BigInt(counter);
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = Number(remainder & 255n);
    remainder >>= 8n;
  }
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = digest[digest.length - 1] & 15;
  const number = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(number % 1_000_000).padStart(6, "0");
}

export async function verifyTotp(secret, code, nowMs = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(nowMs / 1000 / MFA_PERIOD_SECONDS);
  let matched = null;
  for (let offset = -MFA_WINDOW; offset <= MFA_WINDOW; offset += 1) {
    const candidate = counter + offset;
    if (candidate >= 0 && equalCode(await totpAt(secret, candidate), code)) matched = candidate;
  }
  return matched;
}

export function createRecoveryCodes(count = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let code = "";
    for (const byte of bytes) code += alphabet[byte & 31];
    return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`;
  });
}

export async function hashRecoveryCode(code) {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z2-9]{16}$/.test(normalized)) return null;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function isRateLimited(db, email) {
  const state = await readSetting(db, failKey(email));
  return Number.isFinite(state?.lockedUntil) && state.lockedUntil > Math.floor(Date.now() / 1000);
}

export async function recordMfaFailure(db, email) {
  const now = Math.floor(Date.now() / 1000);
  const key = failKey(email);
  const initial = { failures: 1, windowStart: now, lockedUntil: 0 };
  const result = await db.prepare(`INSERT INTO admin_settings(key, value_json, updated_at, updated_by)
    VALUES (?, ?, ?, 'system')
    ON CONFLICT(key) DO UPDATE SET
      value_json = json_object(
        'failures', CASE WHEN ? - CAST(json_extract(admin_settings.value_json, '$.windowStart') AS INTEGER) < ? THEN CAST(json_extract(admin_settings.value_json, '$.failures') AS INTEGER) + 1 ELSE 1 END,
        'windowStart', CASE WHEN ? - CAST(json_extract(admin_settings.value_json, '$.windowStart') AS INTEGER) < ? THEN CAST(json_extract(admin_settings.value_json, '$.windowStart') AS INTEGER) ELSE ? END,
        'lockedUntil', CASE WHEN (CASE WHEN ? - CAST(json_extract(admin_settings.value_json, '$.windowStart') AS INTEGER) < ? THEN CAST(json_extract(admin_settings.value_json, '$.failures') AS INTEGER) + 1 ELSE 1 END) >= ? THEN ? + ? ELSE 0 END
      ),
      updated_at = excluded.updated_at,
      updated_by = 'system'`)
    .bind(key, JSON.stringify(initial), new Date().toISOString(), now, MFA_LOCK_SECONDS, now, MFA_LOCK_SECONDS, now, now, MFA_LOCK_SECONDS, MFA_MAX_FAILURES, now, MFA_LOCK_SECONDS).run();
  if (!result.success) throw new Error("mfa_failure_record_failed");
  return isRateLimited(db, email);
}

export async function clearMfaFailures(db, email) {
  await deleteSetting(db, failKey(email));
}

export function totpProvisioningUri(secret, email) {
  const label = `UMA Admin:${email}`;
  const params = new URLSearchParams({ secret, issuer: "UMA Admin", algorithm: "SHA1", digits: "6", period: String(MFA_PERIOD_SECONDS) });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function formatRecoveryCode(code) {
  return code.replace(/-/g, "");
}
