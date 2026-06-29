---
name: Schema vs DB drift
description: The targets table in Replit Postgres is missing columns that exist in the Drizzle schema — always add IF NOT EXISTS migrations for new schema columns.
---

# Schema vs DB drift in targets table

## The rule
Whenever a column is added to `lib/db/src/schema/targets.ts` (or any other pre-existing table), a corresponding `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` must be added to the startup migration in `artifacts/api-server/src/index.ts`.

**Why:** The `targets` table was created by the original Python SQLAlchemy / Supabase app. When migrating to Replit Postgres, the startup migration recreates child tables (actions, milestones, etc.) from scratch but does NOT recreate `targets` — it already existed. Any Drizzle schema column that wasn't in the original Supabase schema will be missing from the Replit Postgres instance, causing "column X does not exist" errors at runtime.

Confirmed missing and now added:
- `deal_type text`
- `risk_penalty_score integer DEFAULT 0`
- `is_confidential boolean DEFAULT true`
- `financial_attractiveness_score integer DEFAULT 50`
- `process_maturity_score integer DEFAULT 50`

**How to apply:**
Add `ALTER TABLE targets ADD COLUMN IF NOT EXISTS <col> <type>` near the other similar stanzas (around line 477 in `artifacts/api-server/src/index.ts`).
