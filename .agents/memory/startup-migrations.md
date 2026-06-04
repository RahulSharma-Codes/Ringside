---
name: Startup migrations pattern
description: Why schema migrations run at server startup instead of drizzle-kit push
---

## Rule
DDL changes are applied via `runMigrationsWithRetry()` in `artifacts/api-server/src/index.ts`
at process startup. All statements use `IF NOT EXISTS` / DO blocks — fully idempotent.

**Why:** `psql` and `drizzle-kit push` cannot reach the database from the Replit shell
environment (ENOTFOUND from psql, interactive TTY prompts from drizzle-kit). The running
server process CAN reach the DB via PGHOST. Background async tasks at process start also
initially fail, hence the retry loop (5s → 15s → 30s → 60s). With Replit Postgres the
first attempt typically succeeds immediately (no DNS warm-up needed).

**How to apply:**
- When adding a new table or column, add a `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD
  COLUMN IF NOT EXISTS` block to `applyMigrations()` in `src/index.ts`.
- Also update `docs/proposed-migrations/` SQL file for reference.
- Do NOT try to run `pnpm --filter @workspace/db run push` from a bash tool — it blocks on
  interactive TTY prompts.
