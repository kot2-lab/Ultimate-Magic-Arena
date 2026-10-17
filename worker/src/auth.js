import {
  clearMfaFailures,
  clearPendingEnrollment,
  createRecoveryCodes,
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  getMfaRecord,
  getPendingEnrollment,
  hashRecoveryCode,
  isRateLimited,
  recordMfaFailure,
  saveMfaRecord,
  savePendingEnrollment,
  totpProvisioningUri,
  updateMfaRecordOnce,
  verifyTotp,
} from "./mfa.js";
const encoder = new TextEncoder();
const ADMIN_SESSION_TTL_SECONDS = 5 * 60;
const MFA_TICKET_TTL_SECONDS = 10 * 60;
let cachedGoogleKeys;
let cachedGoogleKeysUntil = 0;

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.get("Cookie") ?? "").split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return ["", ""];
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }).filter(([key]) => key));
}

async function hmacKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("missing_session_secret");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signPayload(payload, secret) {
  const value = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(value));
  return `${value}.${base64url(new Uint8Array(signature))}`;
}

async function verifyPayload(value, secret) {
  if (typeof value !== "string") return null;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), decodeBase64url(signature), encoder.encode(encoded));
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(decodeBase64url(encoded)));
  } catch {
    return null;
  }
}

function randomToken(byteCount = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  return base64url(bytes);
}

function secureCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function redirectWithCookies(location, cookies) {
  const headers = new Headers({ ...noStoreHeaders(), Location: location });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function noStoreHeaders() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...noStoreHeaders(), "Content-Type": "application/json; charset=utf-8" } });
}

function sameOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function redirectToAdmin(request, query = "") {
  const url = new URL("/admin", request.url);
  if (query) url.searchParams.set("login", query);
  return new Response(null, { status: 302, headers: { ...noStoreHeaders(), Location: url.toString() } });
}

function redirectLoginFailure(request, stage) {
  const url = new URL("/admin", request.url);
  url.searchParams.set("login", "failed");
  url.searchParams.set("stage", stage);
  return new Response(null, { status: 302, headers: { ...noStoreHeaders(), Location: url.toString() } });
}

function callbackUrl(request) {
  return new URL("/auth/google/callback", request.url).toString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function authPage(title, content, status = 200) {
  return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · UMA 運営管理室</title><style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121217;color:#f4ead8;font:16px/1.7 system-ui,"Yu Gothic UI",sans-serif}.panel{width:min(560px,calc(100% - 36px));box-sizing:border-box;padding:28px;border:1px solid #594a32;border-radius:10px;background:linear-gradient(145deg,#211e20,#19191e);box-shadow:0 20px 70px #0008}h1{font:500 26px Georgia,"Yu Mincho",serif;color:#d9ba7b}p{color:#c6baa7}.field{display:grid;gap:8px;margin:18px 0}input{box-sizing:border-box;width:100%;padding:13px;border:1px solid #64543a;border-radius:6px;background:#121217;color:#fff;font:inherit;letter-spacing:.12em}button,.link{display:inline-block;padding:11px 16px;border:1px solid #a98b52;border-radius:6px;background:#80632f;color:#fff8e8;font:inherit;text-decoration:none;cursor:pointer}button{width:100%}.secret,.codes{padding:14px;overflow-wrap:anywhere;border:1px solid #493d2c;border-radius:6px;background:#111116;font-family:ui-monospace,monospace}.codes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.error{color:#ffb3a9}.note{font-size:13px;color:#a99e8c}a{color:#e7c77e}</style><main class="panel"><div style="color:#c8a867;letter-spacing:.16em;font-size:11px">SECURE OPERATIONS</div><h1>${escapeHtml(title)}</h1>${content}</main></html>`, {
    status,
    headers: {
      ...noStoreHeaders(),
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
    },
  });
}

function mfaCodeForm(action, message = "") {
  return `<p>Googleログインの確認が完了しました。認証アプリに表示されている6桁コード、または保存したバックアップコードを入力してください。</p>${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}<form method="post" action="${action}"><label class="field">確認コード<input name="code" inputmode="text" autocomplete="one-time-code" autocapitalize="characters" required maxlength="32" autofocus></label><button type="submit">確認して管理画面へ</button></form><p class="note">コードを5回間違えると15分間ロックされます。</p>`;
}

function sessionCookie(email, now, signingSecret) {
  return signPayload({ email, issuedAt: now, expiresAt: now + ADMIN_SESSION_TTL_SECONDS, mfaVerified: true }, signingSecret)
    .then((session) => secureCookie("uma_admin_session", session, ADMIN_SESSION_TTL_SECONDS));
}

async function googleIdentityStillAllowed(email, env) {
  const account = await env.DB.prepare("SELECT status FROM admin_accounts WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (account) return account.status === "active";
  const active = await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_accounts WHERE status = 'active'").first();
  return active?.count === 0 && env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() === email;
}

async function auditMfa(env, email, action, details = {}) {
  await env.DB.prepare("INSERT INTO admin_audit_logs(id, actor_email, action, target, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), email, action, email, JSON.stringify(details), new Date().toISOString()).run();
}

async function readMfaTicket(request, env, cookieName) {
  const signed = parseCookies(request)[cookieName];
  const ticket = await verifyPayload(signed, env.ADMIN_SESSION_SECRET);
  const now = Math.floor(Date.now() / 1000);
  if (!ticket || typeof ticket.email !== "string" || !Number.isFinite(ticket.issuedAt) || ticket.issuedAt > now + 60 || now - ticket.issuedAt > MFA_TICKET_TTL_SECONDS) return null;
  return ticket;
}

async function mfaCheckCode(env, email, code, { record, allowRecovery = true } = {}) {
  if (await isRateLimited(env.DB, email)) return { ok: false, locked: true };
  let valid = false;
  let matchedCounter = null;
  let recoveryHashes = record?.recoveryHashes ?? [];
  if (record?.enabled && record.iv && record.ciphertext) {
    const secret = await decryptTotpSecret(record, email, env.ADMIN_SESSION_SECRET);
    matchedCounter = await verifyTotp(secret, code);
    valid = matchedCounter !== null && (!Number.isFinite(record.lastCounter) || matchedCounter > record.lastCounter);
  }
  if (!valid && allowRecovery && Array.isArray(recoveryHashes)) {
    const hash = await hashRecoveryCode(code);
    const index = hash ? recoveryHashes.indexOf(hash) : -1;
    if (index >= 0) {
      recoveryHashes = recoveryHashes.filter((_, itemIndex) => itemIndex !== index);
      valid = true;
    }
  }
  if (!valid) {
    const locked = await recordMfaFailure(env.DB, email);
    return { ok: false, locked };
  }
  await clearMfaFailures(env.DB, email);
  return { ok: true, recoveryHashes, matchedCounter };
}

async function beginMfaChallenge(request, env, email, clearOauthCookie = false) {
  const now = Math.floor(Date.now() / 1000);
  const ticket = await signPayload({ email, issuedAt: now }, env.ADMIN_SESSION_SECRET);
  const headers = new Headers({ ...noStoreHeaders(), Location: new URL("/auth/mfa", request.url).toString() });
  if (clearOauthCookie) headers.append("Set-Cookie", clearCookie("uma_oauth_state"));
  headers.append("Set-Cookie", clearCookie("uma_admin_session"));
  headers.append("Set-Cookie", clearCookie("uma_mfa_setup"));
  headers.append("Set-Cookie", secureCookie("uma_mfa_pending", ticket, MFA_TICKET_TTL_SECONDS));
  return new Response(null, { status: 302, headers });
}

async function beginMfaSetup(request, env, email, clearOauthCookie = false) {
  const now = Math.floor(Date.now() / 1000);
  const ticket = await signPayload({ email, issuedAt: now }, env.ADMIN_SESSION_SECRET);
  const headers = new Headers({ ...noStoreHeaders(), Location: new URL("/auth/mfa/setup", request.url).toString() });
  if (clearOauthCookie) headers.append("Set-Cookie", clearCookie("uma_oauth_state"));
  headers.append("Set-Cookie", clearCookie("uma_admin_session"));
  headers.append("Set-Cookie", clearCookie("uma_mfa_pending"));
  headers.append("Set-Cookie", secureCookie("uma_mfa_setup", ticket, MFA_TICKET_TTL_SECONDS));
  return new Response(null, { status: 302, headers });
}

async function setupMfaPage(request, env) {
  const ticket = await readMfaTicket(request, env, "uma_mfa_setup");
  if (!ticket) return redirectLoginFailure(request, "mfa_ticket");
  if (!(await googleIdentityStillAllowed(ticket.email, env))) return redirectLoginFailure(request, "mfa_access");
  const existing = await getMfaRecord(env.DB, ticket.email);
  if (existing?.enabled) return beginMfaChallenge(request, env, ticket.email);

  const secret = createTotpSecret();
  const encrypted = await encryptTotpSecret(secret, ticket.email, env.ADMIN_SESSION_SECRET);
  await savePendingEnrollment(env.DB, ticket.email, { ...encrypted, expiresAt: Math.floor(Date.now() / 1000) + MFA_TICKET_TTL_SECONDS });
  const uri = totpProvisioningUri(secret, ticket.email);
  return authPage("認証アプリを登録", `<p>Google Authenticatorなどの認証アプリで「アカウントを追加」→「設定キーを入力」を選びます。次のキーを登録してください。</p><p class="secret"><b>キー：</b>${escapeHtml(secret)}</p><p class="note">アカウント名：UMA Admin · キーの種類：時間ベース（TOTP）</p><details><summary>設定URIを表示</summary><p class="secret">${escapeHtml(uri)}</p></details><form method="post" action="/auth/mfa/setup/confirm"><label class="field">アプリに表示された6桁コード<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required maxlength="6" autofocus></label><button type="submit">認証アプリを確認して有効化</button></form><p class="note">有効化後にバックアップコードを一度だけ表示します。安全な場所に保存してください。</p>`);
}

async function confirmMfaSetup(request, env) {
  if (!sameOrigin(request)) return json({ error: "origin_rejected" }, 403);
  const ticket = await readMfaTicket(request, env, "uma_mfa_setup");
  if (!ticket) return redirectLoginFailure(request, "mfa_ticket");
  if (!(await googleIdentityStillAllowed(ticket.email, env))) return redirectLoginFailure(request, "mfa_access");
  if (await isRateLimited(env.DB, ticket.email)) return authPage("しばらく待ってください", `<p class="error">試行回数が上限に達しました。15分後にGoogleログインからやり直してください。</p><a class="link" href="/auth/google">Googleでログイン</a>`, 429);
  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim();
  const pending = await getPendingEnrollment(env.DB, ticket.email);
  const now = Math.floor(Date.now() / 1000);
  if (!pending || !Number.isFinite(pending.expiresAt) || pending.expiresAt <= now) return authPage("登録の有効期限が切れました", `<p>安全のため設定キーを破棄しました。Googleログインからやり直してください。</p><a class="link" href="/auth/google">Googleでログイン</a>`, 410);
  const secret = await decryptTotpSecret(pending, ticket.email, env.ADMIN_SESSION_SECRET);
  const matchedCounter = await verifyTotp(secret, code);
  if (matchedCounter === null) {
    const locked = await recordMfaFailure(env.DB, ticket.email);
    return authPage("コードを確認できません", `<p class="error">${locked ? "試行回数の上限です。15分後にGoogleログインからやり直してください。" : "認証アプリの最新コードを確認してください。"}</p><a class="link" href="/auth/mfa/setup">設定をやり直す</a>`, locked ? 429 : 400);
  }
  await clearMfaFailures(env.DB, ticket.email);
  const recoveryCodes = createRecoveryCodes();
  const recoveryHashes = await Promise.all(recoveryCodes.map(hashRecoveryCode));
  await saveMfaRecord(env.DB, ticket.email, { enabled: true, iv: pending.iv, ciphertext: pending.ciphertext, recoveryHashes, lastCounter: matchedCounter });
  await clearPendingEnrollment(env.DB, ticket.email);
  await auditMfa(env, ticket.email, "auth.mfa.enabled");
  const cookie = await sessionCookie(ticket.email, now, env.ADMIN_SESSION_SECRET);
  const headers = new Headers({ ...noStoreHeaders(), "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "X-Frame-Options": "DENY" });
  headers.append("Set-Cookie", clearCookie("uma_mfa_setup"));
  headers.append("Set-Cookie", cookie);
  const codeList = recoveryCodes.map((code) => `<code>${escapeHtml(code)}</code>`).join("");
  return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>バックアップコード · UMA 運営管理室</title><style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121217;color:#f4ead8;font:16px/1.7 system-ui,"Yu Gothic UI",sans-serif}.panel{width:min(560px,calc(100% - 36px));box-sizing:border-box;padding:28px;border:1px solid #594a32;border-radius:10px;background:#1b1b20}h1{font:500 26px Georgia,"Yu Mincho",serif;color:#d9ba7b}.codes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.codes code{padding:8px;border:1px solid #493d2c;border-radius:5px;background:#111116;text-align:center}.note{color:#c6baa7;font-size:13px}a{display:inline-block;margin-top:14px;padding:11px 16px;border:1px solid #a98b52;border-radius:6px;background:#80632f;color:#fff8e8;text-decoration:none}</style><main class="panel"><div style="color:#c8a867;letter-spacing:.16em;font-size:11px">SECURE OPERATIONS</div><h1>バックアップコードを保存</h1><p>認証アプリを使えない場合の復旧用コードです。各コードは一度だけ使えます。この画面を閉じると再表示できません。</p><div class="codes">${codeList}</div><p class="note">パスワード管理アプリなど本人だけが見られる場所に保存してください。このコードを他人に送らないでください。</p><a href="/admin">保存して管理画面へ</a></main></html>`, { status: 200, headers });
}

async function verifyMfaLogin(request, env) {
  if (!sameOrigin(request)) return json({ error: "origin_rejected" }, 403);
  const ticket = await readMfaTicket(request, env, "uma_mfa_pending");
  if (!ticket) return redirectLoginFailure(request, "mfa_ticket");
  if (!(await googleIdentityStillAllowed(ticket.email, env))) return redirectLoginFailure(request, "mfa_access");
  if (await isRateLimited(env.DB, ticket.email)) return authPage("しばらく待ってください", `<p class="error">コードの試行回数が上限に達しました。15分後にもう一度Googleログインしてください。</p><a class="link" href="/auth/google">Googleでログイン</a>`, 429);
  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim();
  const record = await getMfaRecord(env.DB, ticket.email);
  if (!record?.enabled) return beginMfaSetup(request, env, ticket.email);
  const result = await mfaCheckCode(env, ticket.email, code, { record });
  if (!result.ok) return authPage("確認コードを確認できません", `${result.locked ? `<p class="error">試行回数の上限です。15分後にGoogleログインからやり直してください。</p><a class="link" href="/auth/google">Googleでログイン</a>` : mfaCodeForm("/auth/mfa/verify", "コードが一致しません。もう一度入力してください。")}`, result.locked ? 429 : 400);
  if (result.matchedCounter !== null) {
    const consumed = await updateMfaRecordOnce(env.DB, ticket.email, record, { ...record, lastCounter: result.matchedCounter });
    if (!consumed) return authPage("コードは使用済みです", `${mfaCodeForm("/auth/mfa/verify", "新しい認証アプリコードを入力してください。")}`, 409);
    await auditMfa(env, ticket.email, "auth.mfa.success");
  } else {
    const consumed = await updateMfaRecordOnce(env.DB, ticket.email, record, { ...record, recoveryHashes: result.recoveryHashes });
    if (!consumed) return authPage("バックアップコードは使用済みです", `${mfaCodeForm("/auth/mfa/verify", "別のバックアップコードを入力してください。")}`, 409);
    await auditMfa(env, ticket.email, "auth.mfa.recovery_used", { remaining: result.recoveryHashes.length });
  }
  const now = Math.floor(Date.now() / 1000);
  const session = await signPayload({ email: ticket.email, issuedAt: now, expiresAt: now + ADMIN_SESSION_TTL_SECONDS, mfaVerified: true }, env.ADMIN_SESSION_SECRET);
  return redirectWithCookies(new URL("/admin", request.url).toString(), [clearCookie("uma_mfa_pending"), secureCookie("uma_admin_session", session, ADMIN_SESSION_TTL_SECONDS)]);
}

async function beginGoogleLogin(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.ADMIN_SESSION_SECRET || !env.DB) return redirectToAdmin(request, "unconfigured");
  const state = randomToken();
  const nonce = randomToken();
  const signedState = await signPayload({ state, nonce, issuedAt: Math.floor(Date.now() / 1000) }, env.ADMIN_SESSION_SECRET);
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    prompt: "select_account",
  }).toString();
  return new Response(null, { status: 302, headers: { ...noStoreHeaders(), Location: authorize.toString(), "Set-Cookie": secureCookie("uma_oauth_state", signedState, 600) } });
}

async function googlePublicKeys() {
  const now = Date.now();
  if (cachedGoogleKeys && cachedGoogleKeysUntil > now) return cachedGoogleKeys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!response.ok) throw new Error("google_keys_unavailable");
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error("invalid_google_keys");
  cachedGoogleKeys = data.keys;
  cachedGoogleKeysUntil = now + 300_000;
  return cachedGoogleKeys;
}

async function verifyGoogleIdToken(idToken, env, expectedNonce) {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  let header;
  let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[1])));
  } catch { return null; }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  const now = Math.floor(Date.now() / 1000);
  if (!Array.isArray(claims.aud) && claims.aud !== env.GOOGLE_CLIENT_ID) return null;
  if (Array.isArray(claims.aud) && (!claims.aud.includes(env.GOOGLE_CLIENT_ID) || claims.azp && claims.azp !== env.GOOGLE_CLIENT_ID)) return null;
  if (!["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)) return null;
  if (!Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60) return null;
  if (claims.nonce !== expectedNonce || claims.email_verified !== true || typeof claims.email !== "string") return null;
  const email = claims.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const jwk = (await googlePublicKeys()).find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) return null;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signatureOk = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
    return signatureOk ? { email } : null;
  } catch {
    return null;
  }
}

async function completeGoogleLogin(request, env) {
  const url = new URL(request.url);
  const cookies = parseCookies(request);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const signedState = await verifyPayload(cookies.uma_oauth_state, env.ADMIN_SESSION_SECRET);
  const now = Math.floor(Date.now() / 1000);
  if (url.searchParams.has("error")) return redirectLoginFailure(request, "google");
  if (!signedState || !state || state !== signedState.state || !Number.isFinite(signedState.issuedAt) || signedState.issuedAt > now + 60 || now - signedState.issuedAt > 600 || !code) return redirectLoginFailure(request, "state");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(request),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return redirectLoginFailure(request, "token");
  const tokens = await tokenResponse.json();
  const googleIdentity = await verifyGoogleIdToken(tokens.id_token ?? "", env, signedState.nonce);
  if (!googleIdentity) return redirectLoginFailure(request, "identity");

  const account = await env.DB.prepare("SELECT role, status FROM admin_accounts WHERE email = ? COLLATE NOCASE").bind(googleIdentity.email).first();
  if (account && account.status !== "active") return redirectToAdmin(request, "denied");
  if (!account) {
    const active = await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_accounts WHERE status = 'active'").first();
    if (active.count !== 0 || env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() !== googleIdentity.email) return redirectToAdmin(request, "denied");
  }
  await env.DB.prepare("INSERT INTO admin_audit_logs(id, actor_email, action, target, details_json, created_at) VALUES (?, ?, 'auth.google.primary_success', ?, '{}', ?)")
    .bind(crypto.randomUUID(), googleIdentity.email, googleIdentity.email, new Date().toISOString()).run();
  const mfaRecord = await getMfaRecord(env.DB, googleIdentity.email);
  return mfaRecord?.enabled
    ? beginMfaChallenge(request, env, googleIdentity.email, true)
    : beginMfaSetup(request, env, googleIdentity.email, true);
}

export async function getAdminIdentity(request, env) {
  const value = parseCookies(request).uma_admin_session;
  const session = await verifyPayload(value, env.ADMIN_SESSION_SECRET);
  const now = Math.floor(Date.now() / 1000);
  if (!session || session.mfaVerified !== true || !Number.isFinite(session.expiresAt) || session.expiresAt <= now || !Number.isFinite(session.issuedAt) || session.issuedAt > now + 60 || session.expiresAt > session.issuedAt + ADMIN_SESSION_TTL_SECONDS || typeof session.email !== "string") return null;
  return session.email;
}

export async function handleAuthRequest(request, env) {
  const { pathname } = new URL(request.url);
  const cookies = parseCookies(request);
  if (pathname === "/auth/mfa" && request.method === "GET") {
    const ticket = await readMfaTicket(request, env, "uma_mfa_pending");
    if (!ticket) return redirectLoginFailure(request, "mfa_ticket");
    if (!(await googleIdentityStillAllowed(ticket.email, env))) return redirectLoginFailure(request, "mfa_access");
    const record = await getMfaRecord(env.DB, ticket.email);
    if (!record?.enabled) return beginMfaSetup(request, env, ticket.email);
    if (await isRateLimited(env.DB, ticket.email)) return authPage("しばらく待ってください", `<p class="error">コードの試行回数が上限に達しました。15分後にもう一度Googleログインしてください。</p><a class="link" href="/auth/google">Googleでログイン</a>`, 429);
    return authPage("管理者本人確認", mfaCodeForm("/auth/mfa/verify"));
  }
  if (pathname === "/auth/mfa/verify" && request.method === "POST") return verifyMfaLogin(request, env);
  if (pathname === "/auth/mfa/setup" && request.method === "GET") return setupMfaPage(request, env);
  if (pathname === "/auth/mfa/setup/confirm" && request.method === "POST") return confirmMfaSetup(request, env);
  if (pathname === "/admin" && request.method === "GET") {
    if (cookies.uma_mfa_pending) return new Response(null, { status: 302, headers: { ...noStoreHeaders(), Location: new URL("/auth/mfa", request.url).toString() } });
    if (cookies.uma_mfa_setup) return new Response(null, { status: 302, headers: { ...noStoreHeaders(), Location: new URL("/auth/mfa/setup", request.url).toString() } });
  }
  if (pathname === "/auth/google" && request.method === "GET") return beginGoogleLogin(request, env);
  if (pathname === "/auth/google/callback" && request.method === "GET") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.ADMIN_SESSION_SECRET || !env.DB) return redirectToAdmin(request, "unconfigured");
    try { return await completeGoogleLogin(request, env); } catch { return redirectLoginFailure(request, "server"); }
  }
  if (pathname === "/auth/logout" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "origin_rejected" }, 403);
    const headers = new Headers({ ...noStoreHeaders(), Location: new URL("/admin", request.url).toString() });
    headers.append("Set-Cookie", clearCookie("uma_admin_session"));
    headers.append("Set-Cookie", clearCookie("uma_mfa_pending"));
    headers.append("Set-Cookie", clearCookie("uma_mfa_setup"));
    headers.append("Set-Cookie", clearCookie("uma_oauth_state"));
    return new Response(null, { status: 303, headers });
  }
  if (pathname.startsWith("/auth/")) return json({ error: "not_found" }, 404);
  return null;
}

