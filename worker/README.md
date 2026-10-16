# UMA Cloudflare API foundation

## Current state

- The dedicated Cloudflare D1 development database `uma-dev` exists. Database ID: `048431c3-b422-4795-af58-4296d452f443`.
- The D1 database is bound as `DB` in `wrangler.toml`; it currently has no tables and contains no UMA player data.
- `uma-api-staging` is a local Worker project only. It has not been deployed and `workers_dev = false`, so this project does not publish a Worker URL.
- The only implemented route is a minimal `GET /api/health`. All other paths and methods fail closed. Health output contains no account or database details.
- CORS permits only the GitHub Pages origin used by UMA. CORS is not authentication; do not add privileged routes without server-side authentication and per-route authorization.
- No OAuth client, API token, Worker secret, production database, admin API, online ranking API, or cloud save is configured.
- The existing `quiz-spark` Worker and `quiz-spark-quiz-db` are separate and must not be reused or modified for UMA.

## Cost and usage guardrails

- Stay on the Workers Free plan. Do not enable paid services or automatic upgrades.
- The dashboard showed 8 existing Worker requests for this account when inspected on 2026-10-16; this is account usage, not UMA usage.
- The dashboard showed 0 of 5 million daily D1 rows read, 0 of 100,000 daily rows written, and 98.3 kB of 5 GB total storage before creating `uma-dev`.
- Cloudflare's D1 Free limits are shared at account level. Reaching daily read/write limits makes D1 queries fail until the limit resets. The UMA client must handle unavailable online services without affecting local CPU play or local saves.
- Do not write to D1 per turn. Add APIs only for authenticated actions that require shared server state.

## Next gated steps

1. Review and deploy the Worker without enabling a public route; verify the deployed script and D1 binding.
2. Configure Google OIDC through a standard flow, with secrets stored only as Worker secrets. The account owner must approve any new credential or GitHub/Cloudflare access grant.
3. Add admin endpoints only after authentication, authorization, session, CSRF, rate-limit, and audit-log checks are implemented and tested.
4. Add the admin UI in a later phase. Keep local saves local; do not build cloud-save endpoints.

Never use this Worker for Quiz Spark or put credentials in source control.
