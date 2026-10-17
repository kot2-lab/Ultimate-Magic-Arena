const encoder = new TextEncoder();
const ADMIN_SESSION_TTL_SECONDS = 5 * 60;
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

function callbackUrl(request) {
  return new URL("/auth/google/callback", request.url).toString();
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
  if (!signedState || !state || state !== signedState.state || !Number.isFinite(signedState.issuedAt) || signedState.issuedAt > now + 60 || now - signedState.issuedAt > 600 || !code || url.searchParams.has("error")) {
    return redirectToAdmin(request, "failed");
  }

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
  if (!tokenResponse.ok) return redirectToAdmin(request, "failed");
  const tokens = await tokenResponse.json();
  const googleIdentity = await verifyGoogleIdToken(tokens.id_token ?? "", env, signedState.nonce);
  if (!googleIdentity) return redirectToAdmin(request, "failed");

  const account = await env.DB.prepare("SELECT role, status FROM admin_accounts WHERE email = ? COLLATE NOCASE").bind(googleIdentity.email).first();
  if (account && account.status !== "active") return redirectToAdmin(request, "denied");
  if (!account) {
    const active = await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_accounts WHERE status = 'active'").first();
    if (active.count !== 0 || env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() !== googleIdentity.email) return redirectToAdmin(request, "denied");
  }
  await env.DB.prepare("INSERT INTO admin_audit_logs(id, actor_email, action, target, details_json, created_at) VALUES (?, ?, 'auth.google.success', ?, '{}', ?)")
    .bind(crypto.randomUUID(), googleIdentity.email, googleIdentity.email, new Date().toISOString()).run();
  const session = await signPayload({ email: googleIdentity.email, issuedAt: now, expiresAt: now + ADMIN_SESSION_TTL_SECONDS }, env.ADMIN_SESSION_SECRET);
  return redirectWithCookies(new URL("/admin", request.url).toString(), [clearCookie("uma_oauth_state"), secureCookie("uma_admin_session", session, ADMIN_SESSION_TTL_SECONDS)]);
}

export async function getAdminIdentity(request, env) {
  const value = parseCookies(request).uma_admin_session;
  const session = await verifyPayload(value, env.ADMIN_SESSION_SECRET);
  const now = Math.floor(Date.now() / 1000);
  if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= now || !Number.isFinite(session.issuedAt) || session.issuedAt > now + 60 || session.expiresAt > session.issuedAt + ADMIN_SESSION_TTL_SECONDS || typeof session.email !== "string") return null;
  return session.email;
}

export async function handleAuthRequest(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname === "/auth/google" && request.method === "GET") return beginGoogleLogin(request, env);
  if (pathname === "/auth/google/callback" && request.method === "GET") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.ADMIN_SESSION_SECRET || !env.DB) return redirectToAdmin(request, "unconfigured");
    try { return await completeGoogleLogin(request, env); } catch { return redirectToAdmin(request, "failed"); }
  }
  if (pathname === "/auth/logout" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "origin_rejected" }, 403);
    const headers = new Headers({ ...noStoreHeaders(), Location: new URL("/admin", request.url).toString() });
    headers.append("Set-Cookie", clearCookie("uma_admin_session"));
    return new Response(null, { status: 303, headers });
  }
  if (pathname.startsWith("/auth/")) return json({ error: "not_found" }, 404);
  return null;
}

