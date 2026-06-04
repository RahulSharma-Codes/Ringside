---
name: Replit Postgres vs Supabase migration
description: Why the DB switched from Supabase to Replit Postgres and how the connection is configured
---

## Rule
`lib/db/src/index.ts` builds the connection URL from `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`
when those env vars are present (Replit managed Postgres), falling back to `DATABASE_URL` only if
PGHOST is absent. Do NOT revert this to "always use DATABASE_URL".

**Why:** The Supabase transaction-mode pooler URL stored in the `DATABASE_URL` secret became
permanently ENOTFOUND from within the Replit environment — both from shell (psql) and from async
background tasks inside the running Node process. Replit's built-in Postgres (`PGHOST` etc.)
is always available and is the correct default.

**How to apply:**
- When adding a new db-dependent package, make sure it reads `PGHOST` first (same logic as lib/db).
- `drizzle.config.ts` has the same fallback — keep it in sync.
- The `DATABASE_URL` secret still exists (old Supabase value). The server ignores it when PGHOST
  is set. If someone deletes the PGHOST family of secrets, the app will try Supabase and fail.
