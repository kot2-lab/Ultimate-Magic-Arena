import { handleAdminApi } from "./admin.js";
import { adminUiResponse } from "./admin-ui.js";
import { handleAuthRequest } from "./auth.js";

const ALLOWED_ORIGINS = new Set([
  "https://kot2-lab.github.io",
]);

function jsonResponse(body, status, origin) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });

  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";

    const authResponse = await handleAuthRequest(request, env);
    if (authResponse) return authResponse;

    const uiResponse = adminUiResponse(url.pathname);
    if (uiResponse) return uiResponse;

    if (url.pathname.startsWith("/api/admin/")) {
      if (url.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: {
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
          "Vary": "Origin",
        } });
      }
      return handleAdminApi(request, { env });
    }

    if (url.pathname !== "/api/health") {
      return jsonResponse({ error: "not_found" }, 404, origin);
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, 405, origin);
    }

    return jsonResponse({ status: "ok" }, 200, origin);
  },
};
