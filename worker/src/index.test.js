import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

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
  const missing = await worker.fetch(new Request("https://uma-api.example/admin"));
  const wrongMethod = await worker.fetch(new Request("https://uma-api.example/api/health", { method: "POST" }));

  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "not_found" });
  assert.equal(wrongMethod.status, 405);
  assert.deepEqual(await wrongMethod.json(), { error: "method_not_allowed" });
});
