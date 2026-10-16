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
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";

    if (url.pathname !== "/api/health") {
      return jsonResponse({ error: "not_found" }, 404, origin);
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, 405, origin);
    }

    return jsonResponse({ status: "ok" }, 200, origin);
  },
};
