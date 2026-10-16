import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
import { adminUiResponse } from "./admin-ui.js";

test("health endpoint returns a minimal no-store response to the game origin", async () => {
  const response = await worker.fetch(new Request("https://uma-api.example/api/health", {
    headers: { Origin: "https://kot2-lab.github.io" },
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://kot2-lab.github.io");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("health endpoint does not grant CORS to unknown origins", async () => {
  const response = await worker.fetch(new Request("https://uma-api.example/api/health", {
    headers: { Origin: "https://attacker.example" },
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("unknown routes and non-GET methods fail closed", async () => {
  const missing = await worker.fetch(new Request("https://uma-api.example/admin/nope"));
  const wrongMethod = await worker.fetch(new Request("https://uma-api.example/api/health", { method: "POST" }));

  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "not_found" });
  assert.equal(wrongMethod.status, 405);
  assert.deepEqual(await wrongMethod.json(), { error: "method_not_allowed" });
});

test("admin page is served without cache and has a restrictive content policy", async () => {
  const response = await worker.fetch(new Request("https://uma-api.example/admin"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(await response.text(), /運営管理室/);
});

test("admin browser script parses before deployment", async () => {
  const response = adminUiResponse("/admin/app.js");
  const source = await response.text();
  assert.doesNotThrow(() => new Function(source));
});

test("admin session reports unauthenticated without querying D1", async () => {
  const response = await worker.fetch(new Request("https://uma-api.example/api/admin/session"), {
    DB: { prepare() { throw new Error("DB must not be queried without a verified identity"); } },
  }, {});

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("admin mutations reject cross-origin requests", async () => {
  const response = await worker.fetch(new Request("https://uma-api.example/api/admin/bootstrap", {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
    body: "{}",
  }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "origin_rejected" });
});
