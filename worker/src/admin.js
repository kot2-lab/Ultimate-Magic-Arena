import { getAdminIdentity } from "./auth.js";
import { DEFAULT_GAME_CONFIG, readGameConfig, validateGameConfig } from "./game-config.js";

const MAX_JSON_BYTES = 12_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  },
});

const badRequest = (error) => json({ error }, 400);

async function readJson(request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const raw = await request.text();
  if (raw.length > MAX_JSON_BYTES) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function validEmail(value) {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value.trim());
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  const expectedOrigin = new URL(request.url).origin;
  if (origin !== null) return origin === expectedOrigin;
  const referer = request.headers.get("Referer");
  if (referer) {
    try { return new URL(referer).origin === expectedOrigin; } catch { return false; }
  }
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

async function authorize(request, ctx, allowedRoles = ["owner", "operator", "viewer"]) {
  const email = await getAdminIdentity(request, ctx.env);
  if (!email || !ctx.env.DB) return { response: json({ error: "unauthorized" }, 401) };
  const account = await ctx.env.DB.prepare(
    "SELECT email, role, status FROM admin_accounts WHERE email = ? COLLATE NOCASE",
  ).bind(email).first();
  if (!account || account.status !== "active") return { response: json({ error: "forbidden" }, 403) };
  if (!allowedRoles.includes(account.role)) return { response: json({ error: "forbidden" }, 403) };
  return { actor: email, role: account.role };
}

async function audit(db, actor, action, target, details = {}) {
  await db.prepare(
    "INSERT INTO admin_audit_logs (id, actor_email, action, target, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), actor, action, target, JSON.stringify(details), new Date().toISOString()).run();
}

async function listAdmins(db) {
  const { results } = await db.prepare(
    "SELECT email, role, status, created_at, updated_at, created_by FROM admin_accounts ORDER BY created_at ASC",
  ).all();
  return results;
}

export async function getPublicRuntimeConfig(db) {
  if (!db) return { game: { ...DEFAULT_GAME_CONFIG }, maintenance: { enabled: false, message: "" }, announcements: [] };
  const [game, maintenanceRow, announcementsResult] = await Promise.all([
    readGameConfig(db),
    db.prepare("SELECT value_json FROM admin_settings WHERE key = 'maintenance'").first(),
    db.prepare("SELECT id, title, body, updated_at FROM announcements WHERE status = 'published' ORDER BY updated_at DESC LIMIT 5").all(),
  ]);
  let maintenance = { enabled: false, message: "" };
  try {
    const value = JSON.parse(maintenanceRow?.value_json ?? "null");
    if (value && typeof value.enabled === "boolean" && typeof value.message === "string") maintenance = { enabled: value.enabled, message: value.message.slice(0, 240) };
  } catch { /* use safe defaults */ }
  return { game: validateGameConfig(game) ?? { ...DEFAULT_GAME_CONFIG }, maintenance, announcements: announcementsResult.results ?? [] };
}

async function bootstrap(request, ctx) {
  if (!sameOrigin(request)) return json({ error: "origin_rejected" }, 403);
  const body = await readJson(request);
  const email = await getAdminIdentity(request, ctx.env);
  if (!body) return badRequest("invalid_request");
  if (!email || !ctx.env.DB) return json({ error: "unauthorized" }, 401);
  const configuredEmail = ctx.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!configuredEmail || email !== configuredEmail) return json({ error: "bootstrap_unavailable" }, 403);
  const now = new Date().toISOString();
  const statements = [ctx.env.DB.prepare(
    "INSERT INTO admin_bootstrap_claim(singleton, email, claimed_at) SELECT 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM admin_accounts) ON CONFLICT(singleton) DO NOTHING",
  ).bind(email, now), ctx.env.DB.prepare(
    "INSERT INTO admin_accounts(email, role, status, created_at, updated_at, created_by) SELECT ?, 'owner', 'active', ?, ?, ? WHERE EXISTS (SELECT 1 FROM admin_bootstrap_claim WHERE singleton=1 AND email=? AND claimed_at=?)",
  ).bind(email, now, now, email, email, now), ctx.env.DB.prepare(
    "INSERT INTO admin_audit_logs(id, actor_email, action, target, details_json, created_at) SELECT ?, ?, 'admin.bootstrap', ?, ?, ? WHERE EXISTS (SELECT 1 FROM admin_accounts WHERE email=? AND role='owner')",
  ).bind(crypto.randomUUID(), email, email, JSON.stringify({ role: "owner" }), now, email)];
  try {
    const results = await ctx.env.DB.batch(statements);
    if (!results[0]?.meta?.changes || !results[1]?.meta?.changes) return json({ error: "bootstrap_already_claimed" }, 409);
  } catch {
    return json({ error: "bootstrap_already_claimed" }, 409);
  }
  return json({ ok: true, role: "owner" }, 201);
}

async function handleAdminApi(request, ctx) {
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === "/api/admin/bootstrap" && method === "POST") return bootstrap(request, ctx);
  if (method !== "GET" && !sameOrigin(request)) return json({ error: "origin_rejected" }, 403);

  if (pathname === "/api/admin/session" && method === "GET") {
    const email = await getAdminIdentity(request, ctx.env);
    if (!email) return json({ authenticated: false });
    if (!ctx.env.DB) return json({ error: "service_unavailable" }, 503);
    const account = await ctx.env.DB.prepare("SELECT email, role, status FROM admin_accounts WHERE email = ? COLLATE NOCASE").bind(email).first();
    if (account?.status === "active") return json({ authenticated: true, email, role: account.role, bootstrapRequired: false });
    const count = await ctx.env.DB.prepare("SELECT COUNT(*) AS count FROM admin_accounts WHERE status = 'active'").first();
    const bootstrapAllowed = count.count === 0 && ctx.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() === email;
    return bootstrapAllowed ? json({ email, bootstrapRequired: true }) : json({ authenticated: false });
  }

  const permissions = pathname === "/api/admin/session" || pathname === "/api/admin/overview" || pathname === "/api/admin/announcements" && method === "GET" || pathname.startsWith("/api/admin/announcements/") && method === "GET" || pathname === "/api/admin/seasons" && method === "GET" || pathname === "/api/admin/audit" && method === "GET"
    ? ["owner", "operator", "viewer"]
    : pathname === "/api/admin/game-config" || pathname.startsWith("/api/admin/announcements") || pathname === "/api/admin/seasons" || pathname === "/api/admin/maintenance" || pathname === "/api/admin/accounts" || pathname.startsWith("/api/admin/accounts/")
      ? ["owner", "operator"]
      : null;
  if (!permissions) return json({ error: "not_found" }, 404);
  const auth = await authorize(request, ctx, permissions);
  if (auth.response) return auth.response;
  const db = ctx.env.DB;

  if (pathname === "/api/admin/overview" && method === "GET") {
    const [admins, announcements, season, maintenance] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM admin_accounts WHERE status = 'active'").first(),
      db.prepare("SELECT COUNT(*) AS count FROM announcements WHERE status = 'published'").first(),
      db.prepare("SELECT season_number, label, status FROM seasons ORDER BY season_number DESC LIMIT 1").first(),
      db.prepare("SELECT value_json FROM admin_settings WHERE key = 'maintenance'").first(),
    ]);
    return json({ adminCount: admins.count, publishedAnnouncements: announcements.count, season, maintenance: JSON.parse(maintenance?.value_json ?? '{"enabled":false,"message":""}') });
  }
  if (pathname === "/api/admin/game-config") {
    if (method === "GET") return json(await readGameConfig(db));
    if (method === "PUT") {
      const body = await readJson(request);
      const config = validateGameConfig(body);
      if (!config) return badRequest("invalid_game_config");
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("INSERT INTO admin_settings(key, value_json, updated_at, updated_by) VALUES ('game_config', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(JSON.stringify(config), now, auth.actor),
        db.prepare("INSERT INTO admin_audit_logs(id, actor_email, action, target, details_json, created_at) VALUES (?, ?, 'settings.game_config.update', 'game_config', ?, ?)").bind(crypto.randomUUID(), auth.actor, JSON.stringify(config), now),
      ]);
      return json({ ok: true, ...config, updatedAt: now, updatedBy: auth.actor });
    }
  }
  if (pathname === "/api/admin/maintenance") {
    if (method === "GET") {
      const row = await db.prepare("SELECT value_json, updated_at, updated_by FROM admin_settings WHERE key = 'maintenance'").first();
      return json(row ? { ...JSON.parse(row.value_json), updatedAt: row.updated_at, updatedBy: row.updated_by } : { enabled: false, message: "" });
    }
    if (method === "PUT") {
      const body = await readJson(request);
      if (!body || typeof body.enabled !== "boolean" || typeof body.message !== "string" || body.message.length > 240) return badRequest("invalid_maintenance_settings");
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("INSERT INTO admin_settings(key, value_json, updated_at, updated_by) VALUES ('maintenance', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by").bind(JSON.stringify({ enabled: body.enabled, message: body.message }), now, auth.actor),
        db.prepare("INSERT INTO admin_audit_logs(id, actor_email, action, target, details_json, created_at) VALUES (?, ?, 'settings.maintenance.update', 'maintenance', ?, ?)").bind(crypto.randomUUID(), auth.actor, JSON.stringify({ enabled: body.enabled }), now),
      ]);
      return json({ ok: true });
    }
  }
  if (pathname === "/api/admin/announcements") {
    if (method === "GET") {
      const { results } = await db.prepare("SELECT id, title, body, status, starts_at, ends_at, created_at, updated_at, updated_by FROM announcements ORDER BY updated_at DESC LIMIT 100").all();
      return json({ announcements: results });
    }
    if (method === "POST") {
      const body = await readJson(request);
      if (!body || typeof body.title !== "string" || !body.title.trim() || body.title.length > 80 || typeof body.body !== "string" || !body.body.trim() || body.body.length > 2000) return badRequest("invalid_announcement");
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("INSERT INTO announcements(id, title, body, status, created_at, updated_at, updated_by) VALUES (?, ?, ?, 'draft', ?, ?, ?)").bind(id, body.title.trim(), body.body.trim(), now, now, auth.actor),
        db.prepare("INSERT INTO admin_audit_logs(id, actor_email, action, target, details_json, created_at) VALUES (?, ?, 'announcement.create', ?, '{}', ?)").bind(crypto.randomUUID(), auth.actor, id, now),
      ]);
      return json({ id, status: "draft" }, 201);
    }
  }
  const announcementMatch = pathname.match(/^\/api\/admin\/announcements\/([0-9a-f-]+)$/i);
  if (announcementMatch && method === "PATCH") {
    const body = await readJson(request);
    if (!body || typeof body.status !== "string" || !["draft", "published", "archived"].includes(body.status)) return badRequest("invalid_announcement_status");
    const now = new Date().toISOString();
    const result = await db.prepare("UPDATE announcements SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?").bind(body.status, now, auth.actor, announcementMatch[1]).run();
    if (!result.meta?.changes) return json({ error: "not_found" }, 404);
    await audit(db, auth.actor, "announcement.status", announcementMatch[1], { status: body.status });
    return json({ ok: true });
  }
  if (pathname === "/api/admin/seasons" && method === "GET") {
    const { results } = await db.prepare("SELECT id, season_number, label, status, starts_at, ends_at, created_at, updated_at FROM seasons ORDER BY season_number DESC").all();
    return json({ seasons: results });
  }
  if (pathname === "/api/admin/seasons" && method === "POST") {
    const body = await readJson(request);
    if (!body || !Number.isInteger(body.seasonNumber) || body.seasonNumber < 1 || body.seasonNumber > 999 || typeof body.label !== "string" || !body.label.trim() || body.label.length > 80) return badRequest("invalid_planned_season");
    const dateOk = (value) => value == null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
    if (!dateOk(body.startsAt) || !dateOk(body.endsAt) || (body.startsAt && body.endsAt && Date.parse(body.endsAt) <= Date.parse(body.startsAt))) return badRequest("invalid_season_dates");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await db.batch([
        db.prepare("INSERT INTO seasons(id, season_number, label, status, starts_at, ends_at, created_at, updated_at, updated_by) VALUES (?, ?, ?, 'planned', ?, ?, ?, ?, ?)").bind(id, body.seasonNumber, body.label.trim(), body.startsAt ?? null, body.endsAt ?? null, now, now, auth.actor),
        db.prepare("INSERT INTO admin_audit_logs(id, actor_email, action, target, details_json, created_at) VALUES (?, ?, 'season.plan', ?, ?, ?)").bind(crypto.randomUUID(), auth.actor, id, JSON.stringify({ seasonNumber: body.seasonNumber }), now),
      ]);
    } catch { return json({ error: "season_number_already_exists" }, 409); }
    return json({ id, status: "planned" }, 201);
  }
  if (pathname === "/api/admin/accounts") {
    if (method === "GET") return json({ accounts: await listAdmins(db) });
    if (method === "POST") {
      if (auth.role !== "owner") return json({ error: "forbidden" }, 403);
      const body = await readJson(request);
      if (!body || !validEmail(body.email) || !["operator", "viewer"].includes(body.role)) return badRequest("invalid_admin_account");
      const email = body.email.trim().toLowerCase();
      const now = new Date().toISOString();
      try {
        await db.batch([
          db.prepare("INSERT INTO admin_accounts(email, role, status, created_at, updated_at, created_by) VALUES (?, ?, 'active', ?, ?, ?)").bind(email, body.role, now, now, auth.actor),
          db.prepare("INSERT INTO admin_audit_logs(id, actor_email, action, target, details_json, created_at) VALUES (?, ?, 'admin.create', ?, ?, ?)").bind(crypto.randomUUID(), auth.actor, email, JSON.stringify({ role: body.role }), now),
        ]);
      } catch { return json({ error: "account_already_exists" }, 409); }
      return json({ ok: true }, 201);
    }
  }
  const accountMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)$/);
  if (accountMatch && method === "PATCH") {
    if (auth.role !== "owner") return json({ error: "forbidden" }, 403);
    let email;
    try { email = decodeURIComponent(accountMatch[1]).toLowerCase(); } catch { return badRequest("invalid_email"); }
    const body = await readJson(request);
    if (!body || !(body.role === undefined || ["operator", "viewer"].includes(body.role)) || !(body.status === undefined || ["active", "disabled"].includes(body.status))) return badRequest("invalid_admin_account");
    if (email === auth.actor && body.status === "disabled") return badRequest("cannot_disable_self");
    const current = await db.prepare("SELECT email FROM admin_accounts WHERE email = ? COLLATE NOCASE").bind(email).first();
    if (!current) return json({ error: "not_found" }, 404);
    const target = await db.prepare("SELECT role, status FROM admin_accounts WHERE email = ? COLLATE NOCASE").bind(email).first();
    if (target.role === "owner" && (body.role && body.role !== "owner" || body.status === "disabled")) {
      const owners = await db.prepare("SELECT COUNT(*) AS count FROM admin_accounts WHERE role='owner' AND status='active'").first();
      if (owners.count <= 1) return json({ error: "cannot_remove_last_owner" }, 409);
    }
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE admin_accounts SET role=COALESCE(?, role), status=COALESCE(?, status), updated_at=? WHERE email=? COLLATE NOCASE").bind(body.role ?? null, body.status ?? null, now, email),
      db.prepare("INSERT INTO admin_audit_logs(id, actor_email, action, target, details_json, created_at) VALUES (?, ?, 'admin.update', ?, ?, ?)").bind(crypto.randomUUID(), auth.actor, email, JSON.stringify(body), now),
    ]);
    return json({ ok: true });
  }
  if (pathname === "/api/admin/audit" && method === "GET") {
    const { results } = await db.prepare("SELECT id, actor_email, action, target, details_json, created_at FROM admin_audit_logs ORDER BY created_at DESC LIMIT 100").all();
    return json({ logs: results });
  }
  return json({ error: "method_not_allowed" }, 405);
}

export { handleAdminApi };
