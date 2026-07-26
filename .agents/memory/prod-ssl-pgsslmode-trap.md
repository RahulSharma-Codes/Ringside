---
name: Production SSL PGSSLMODE trap
description: Why ssl=false keeps appearing in production despite explicit ssl config in pg Pool; how to fix permanently.
---

## The Problem

The `connection is insecure (try using 'sslmode=require')` error in production persists even when `ssl: { rejectUnauthorized: false }` is passed to the pg Pool constructor if:

1. `PGSSLMODE=disable` is set in the production environment (stale secret the user once added), OR
2. The pg `connection-parameters.js` URL parser (`Object.assign({}, config, parse(connectionString))`) overrides the `ssl` key from a parsed URL.

**Root cause of the persistence:** Our original `getSslConfig()` checked `PGSSLMODE` BEFORE `NODE_ENV`. If `PGSSLMODE=disable` lingered in Replit's production env (even after the user "removed" it from the secrets panel), that check fired first and returned `false`, bypassing the `NODE_ENV=production` guard entirely.

## The Fix (applied)

In `lib/db/src/index.ts`:

1. **NODE_ENV=production guard is FIRST** — production always returns `{ rejectUnauthorized: false }` before any `PGSSLMODE` check. A stale `PGSSLMODE=disable` cannot override production SSL.

2. **Individual params instead of connectionString** — when `PGHOST/PGUSER/PGPASSWORD/PGDATABASE` are all set, the Pool is configured with individual fields rather than a `connectionString`. This bypasses `pg-connection-string`'s URL parser, which uses `Object.assign({}, config, parse(url))` and could override the explicit `ssl` key.

3. **Startup diagnostic log** — `[db] SSL config: ... | NODE_ENV=... | PGHOST=... | PGSSLMODE=...` prints on every start so production SSL state is visible in deployment logs immediately.

## How to Apply

If SSL errors reappear:
1. Check the startup log for `[db] SSL config:`.
2. If it shows `false` in production, check whether `PGSSLMODE=disable` is set as a secret.
3. The NODE_ENV guard should prevent this, but confirm `NODE_ENV=production` appears in the same log line.

**Why:** esbuild does NOT inline `process.env.NODE_ENV` (no `define` in `build.mjs`), so the check is a runtime evaluation — it depends on the `[services.production.run.env]` `NODE_ENV = "production"` in the artifact.toml being present.
