import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";
import { adminUiResponse } from "../worker/src/admin-ui.js";

const request = (path, init = {}) => new Request(`https://uma.example${path}`, init);

test("admin UI assets are private, non-cacheable, and protected against framing", async () => {
  const response = adminUiResponse("/admin");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match(await response.text(), /Googleでログイン/);
  const script = await adminUiResponse("/admin/app.js").text();
  assert.doesNotThrow(() => new Function(script));
});

test("admin APIs reject requests without a signed Google session", async () => {
  const response = await worker.fetch(request("/api/admin/overview"), { DB: {} });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("an unauthenticated visitor sees a login state instead of an API error", async () => {
  const response = await worker.fetch(request("/api/admin/session"), { DB: {} });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("Google login does not start until required secrets and D1 are configured", async () => {
  const response = await worker.fetch(request("/auth/google"), {});
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://uma.example/admin?login=unconfigured");
});

test("Google login redirects with a short-lived secure, HttpOnly state cookie", async () => {
  const env = { GOOGLE_CLIENT_ID: "client-id", GOOGLE_CLIENT_SECRET: "client-secret", ADMIN_SESSION_SECRET: "a".repeat(40), DB: {} };
  const response = await worker.fetch(request("/auth/google"), env);
  const location = new URL(response.headers.get("Location"));
  assert.equal(response.status, 302);
  assert.equal(location.origin, "https://accounts.google.com");
  assert.equal(location.searchParams.get("client_id"), "client-id");
  assert.equal(location.searchParams.get("scope"), "openid email profile");
  assert.match(response.headers.get("Set-Cookie"), /^uma_oauth_state=.+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
});

test("logout rejects cross-origin requests", async () => {
  const response = await worker.fetch(request("/auth/logout", { method: "POST", headers: { Origin: "https://attacker.example" } }), {});
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "origin_rejected" });
});

test("forged admin cookies do not authenticate", async () => {
  const env = { ADMIN_SESSION_SECRET: "a".repeat(40), DB: {} };
  const response = await worker.fetch(request("/api/admin/overview", { headers: { Cookie: "uma_admin_session=forged.payload" } }), env);
  assert.equal(response.status, 401);
});
