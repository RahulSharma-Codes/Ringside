---
name: Production SSL / PGSSLMODE trap
description: Why production kept getting "connection is insecure" and what actually fixed it
---

## Rule

Do NOT set `ssl` explicitly in the pg Pool config. Let pg read `PGSSLMODE` from the environment natively via `readSSLConfigFromEnvironment()`. Set `PGSSLMODE=no-verify` in the **production** environment only (via Replit env vars, not code).

**Why:**
Something in the pg-pool → Client → ConnectionParameters chain fails to thread an explicit `ssl: { rejectUnauthorized: false }` Pool option through to the actual TCP connection in the production deployment. The connection is established without SSL and the Postgres server rejects it with "connection is insecure". Extensive debugging confirmed the source code looks correct but the runtime doesn't behave as expected.

The reliable fix: omit `ssl` from the Pool config entirely so that `typeof config.ssl === 'undefined'` is true, which causes ConnectionParameters to call `readSSLConfigFromEnvironment()`. With `PGSSLMODE=no-verify` in the production env, that function returns `{ rejectUnauthorized: false }` (natively supported by pg's switch-case, confirmed in bundled dist).

**How to apply:**
- `lib/db/src/index.ts` `getPoolConfig()` must NOT include `ssl` in the returned object.
- `PGSSLMODE=no-verify` must be set in the production environment (`setEnvVars({ environment: "production", values: { PGSSLMODE: "no-verify" } })`).
- Dev works because PGSSLMODE is unset → `readSSLConfigFromEnvironment()` → `defaults.ssl = false` → no SSL → helium works.
- **Never** set a stale `PGSSLMODE=disable` in shared env — it would override the production no-verify.

**Additional context:**
- `console.log` does NOT appear in Replit deployment logs — only pino JSON-format logs are captured. Use pino to log anything you need to diagnose in production.
- The first failing query in production was `SELECT set_config('app.company_id', DEFAULT_COMPANY_ID, false)` — line 98 of `artifacts/api-server/src/index.ts`, the very first DB call in `applyMigrations()`. This is the RLS GUC setup, not a DDL statement.
- `PGSSLMODE=no-verify` is a valid pg env var value (not just pg-connection-string): pg's own `readSSLConfigFromEnvironment()` has a `case "no-verify": return { rejectUnauthorized: false }` branch.
