# UMA Cloudflare Worker and admin console

## Current verified project state (2026-10-16)

- `uma-api-staging` is the dedicated Cloudflare Worker project connected to `kot2-lab/Ultimate-Magic-Arena`, with repository root `worker` and production branch `release/ver-1.0` configured in the dashboard.
- The first GitHub Actions build from the default `main` branch failed because that branch did not contain the configured `worker` root. The `release/ver-1.0` branch now contains the Worker source. A successful deployment has not yet been confirmed.
- `workers_dev = false`; no custom domain or Worker route is configured. The Worker currently has no public URL.
- The dedicated D1 database `uma-dev` is bound as `DB` (ID `048431c3-b422-4795-af58-4296d452f443`). Migration `0001_admin_console.sql` is committed as source but has not yet been applied in Cloudflare D1. It has no player data.
- Cloudflare Zero Trust onboarding, an Access application/policy, and MFA enforcement are not configured. Do not enable `workers.dev`, routes, or a public admin URL until Access is configured and verified.
- A Cloudflare Worker API token exists in the Cloudflare project setup. Never put it in this repository or send it in chat. Do not create another token unless it is actually needed.
- Existing Quiz Spark resources are separate and must not be reused or modified.

## Implemented in this source phase

- `GET /api/health` remains a minimal public health check.
- `/admin` serves a responsive, fantasy-themed management console without binding static assets. It sets a restrictive CSP, `no-store`, `no-referrer`, and anti-framing headers.
- Admin APIs require Cloudflare Worker Access identity via `ctx.access.getIdentity()` and check the identity against active D1 admin roles on each request. No client-provided email or role is trusted.
- Initial owner enrollment requires both a verified Access email and a matching `BOOTSTRAP_ADMIN_EMAIL` Worker secret. The one-time claim and owner creation are atomic; the email must not be committed to source.
- D1 tables support admin accounts and roles, maintenance configuration, announcements, planned seasons (with Season 0 preserved), and append-only audit logs.
- The console supports maintenance configuration, announcement drafts/status, planned season registration, admin account creation/role/status management, overview, and audit-log reading.
- Announcements are not yet wired into the public game UI. Maintenance configuration is stored but does not yet block the public game/API. Season 1 activation and rating processing are intentionally unavailable. Player bans, game numeric settings, BGM settings, ranking, player accounts, OAuth, and online battles are not implemented.
- CORS is not authentication. Admin mutation endpoints additionally require same-origin requests and JSON content type, validate payload size and fields, and do not expose D1 errors.

## Deployment gates

1. Finish Cloudflare Zero Trust organization setup. Create an Access application scoped to this Worker and allow only the UMA operator account(s); enforce MFA. Keep `workers.dev` disabled until verified.
2. Apply `0001_admin_console.sql` to the `uma-dev` D1 database and confirm the tables/default Season 0 exist.
3. Configure the GitHub deployment job to run D1 migrations before Worker deployment, or run the migration once through the Cloudflare D1 console. Never apply the migration to any Quiz Spark database.
4. Add `BOOTSTRAP_ADMIN_EMAIL` as a Worker secret in the Cloudflare dashboard for the one initial operator. Do not put the email or any token in Git. Open the Worker only after the Access application and MFA policy are active.
5. Verify deployment, identity rejection for non-admin users, admin role enforcement, bootstrap one-time behavior, CSRF rejection, audit creation, and D1 Free usage before considering an admin URL ready to share.
6. After verified access, tell the user the exact URL. Until then, do not claim the server or admin panel is live.

## Cost and usage guardrails

- Stay on Workers Free and do not enable paid services or automatic upgrades.
- D1 is shared against the account's Free limits. Avoid per-turn writes and keep online services optional so local CPU play and local saves continue if Cloudflare is unavailable.
- Player adventure saves remain local. No cloud-save endpoint is planned.
- No Google OAuth client or secrets are configured. UMA must not store Google passwords.
- The current Access integration uses Cloudflare identity for operator access; admin role checks are still maintained in D1. Do not claim this is perfect or the only security layer.

Never use this Worker for Quiz Spark or put credentials in source control.
