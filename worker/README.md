# UMA Cloudflare Worker and admin console

## Current verified project state (2026-10-16)

- `uma-api-staging` is the dedicated Cloudflare Worker project connected to `kot2-lab/Ultimate-Magic-Arena`, with repository root `worker` and production branch `release/ver-1.0` configured in the dashboard.
- The first Cloudflare Git integration build from the default `main` branch failed because that branch did not contain the configured `worker` root. The `release/ver-1.0` branch now contains the Worker source. A successful deployment has not yet been confirmed.
- Cloudflare dashboard has enabled the production `workers.dev` URL: `https://uma-api-staging.r8asknazotoki.workers.dev`. The `/admin` page has been opened and visually verified. Preview URL remains disabled; there is no custom domain or Worker route.
- The dedicated D1 database `uma-dev` is bound as `DB` (ID `048431c3-b422-4795-af58-4296d452f443`). Migration `0001_admin_console.sql` is committed as source but has not yet been applied in Cloudflare D1. It has no player data.
- Cloudflare Zero Trust Access would require entering billing details during onboarding; the user has explicitly declined payment and billing setup. Do not continue through that checkout. The source now uses Google OAuth with server-side D1 role checks instead; its secrets and callback still need configuration before enabling a public Worker URL.
- Cloudflare Git integration is configured. Never copy dashboard-managed tokens or secrets into this repository or chat.
- Existing Quiz Spark resources are separate and must not be reused or modified.

## Implemented in this source phase

- `GET /api/health` remains a minimal public health check.
- `/admin` serves a responsive, fantasy-themed management console without binding static assets. It sets a restrictive CSP, `no-store`, `no-referrer`, and anti-framing headers.
- Admin APIs require an HMAC-signed, HttpOnly, Secure, SameSite=Lax session created only after Google OAuth ID-token signature/claim verification; each request is checked against active D1 admin roles. No client-provided email or role is trusted.
- Initial owner enrollment requires a Google-verified email matching the `BOOTSTRAP_ADMIN_EMAIL` Worker secret. The one-time claim and owner creation are atomic; the email must not be committed to source.
- D1 tables support admin accounts and roles, maintenance configuration, announcements, planned seasons (with Season 0 preserved), and append-only audit logs.
- The console supports maintenance configuration, announcement drafts/status, planned season registration, admin account creation/role/status management, overview, and audit-log reading.
- Announcements are not yet wired into the public game UI. Maintenance configuration is stored but does not yet block the public game/API. Season 1 activation and rating processing are intentionally unavailable. Player bans, game numeric settings, BGM settings, ranking, player accounts, and online battles are not implemented. Google OAuth source exists but is not configured or deployed.
- CORS is not authentication. Admin mutation endpoints additionally require same-origin requests and JSON content type, validate payload size and fields, and do not expose D1 errors.

## Deployment gates

1. Finish Cloudflare Zero Trust organization setup. Create an Access application scoped to this Worker and allow only the UMA operator account(s); enforce MFA. Keep `workers.dev` disabled until verified.
2. Apply `0001_admin_console.sql` to the `uma-dev` D1 database and confirm the tables/default Season 0 exist.
3. Configure Cloudflare's deploy command to run `npm run deploy` from the `worker` root (it applies D1 migrations, then deploys), or apply the migration once through the Cloudflare D1 console before deployment. Never apply the migration to any Quiz Spark database.
4. The free production `workers.dev` URL is now enabled. After migration and secrets are ready, deploy, complete the initial owner enrollment, then disable the bootstrap secret. Avoid paid features.
5. Verify deployment, rejection for non-admin Google accounts, admin role enforcement, bootstrap one-time behavior, CSRF rejection, audit creation, and D1 Free usage before considering an admin URL ready to share.
6. After verified access, tell the user the exact URL. Until then, do not claim the server or admin panel is live.

## Cost and usage guardrails

- Stay on Workers Free and do not enable paid services or automatic upgrades.
- D1 is shared against the account's Free limits. Avoid per-turn writes and keep online services optional so local CPU play and local saves continue if Cloudflare is unavailable.
- Player adventure saves remain local. No cloud-save endpoint is planned.
- The Worker is deployed and serves the admin login page. Google OAuth code is implemented, but client ID, client secret, signing secret, bootstrap email, and D1 migration status are not yet verified/configured. `/auth/google` currently returns to `/admin?login=unconfigured`. UMA must not store Google passwords.
- Do not enable paid Cloudflare services or enter payment details. Google OAuth is the current no-payment authentication design.

Never use this Worker for Quiz Spark or put credentials in source control.
