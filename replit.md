# Ringside — M&A Deal Intelligence Platform

**Manipal Group · Corporate Development & Strategy**

> **Maintenance note**: This file is the living source of truth for the project. Update it whenever architecture changes, new env vars are added, migrations are added, or significant decisions are made.

---

## Overview

Full-stack M&A deal management platform for tracking acquisition targets through the full deal lifecycle — from initial screening through IC approval. Single-tenant (one company), deployed on Replit managed infrastructure.

**Production URL**: `https://ringside-tmg.replit.app`

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Node.js | 24 |
| Frontend | React 19 + Vite + TailwindCSS + shadcn/ui |
| API | Express 5 |
| Database | PostgreSQL (Replit Postgres, PGHOST) + Drizzle ORM |
| Validation | Zod (`zod/v4`), `drizzle-zod` |
| API codegen | Orval (OpenAPI spec → React Query hooks + Zod schemas) |
| Auth | JWT (password login primary, OTP backup/first-login) |
| Build | esbuild (for API server bundle) |
| Testing | Playwright E2E (`tests/` workspace) |
| Observability | Pino logging, Sentry error tracking |

---

## Monorepo Structure

```
/
├── artifacts/
│   ├── api-server/          # Express 5 API — the backend
│   │   ├── src/
│   │   │   ├── index.ts     # Startup: migrations, server bootstrap
│   │   │   ├── app.ts       # Express app, middleware chain, route mounts
│   │   │   ├── routes/      # Feature routers (targets, actions, ai, …)
│   │   │   ├── middlewares/ # auth.ts, company-context
│   │   │   └── lib/         # target-access.ts, logger.ts, …
│   │   └── build.mjs        # esbuild bundle config
│   ├── growth-os/           # React frontend (Vite)
│   │   └── src/
│   │       ├── pages/       # Route-level page components
│   │       ├── components/  # Shared UI components
│   │       └── hooks/       # React Query + custom hooks
│   ├── backup-worker/       # Scheduled DB dump → object storage
│   └── mockup-sandbox/      # Canvas / design preview (Vite)
├── lib/
│   ├── db/                  # @workspace/db — Pool, Drizzle instance, schema
│   │   └── src/
│   │       ├── index.ts     # Pool config, acquireRequestContext, withCompanyTransaction
│   │       └── schema/      # Drizzle table definitions
│   ├── api-spec/            # OpenAPI spec source
│   ├── api-client-react/    # Generated React Query hooks
│   └── api-zod/             # Generated Zod schemas
├── scripts/                 # seed-demo-data, test-rls-isolation
└── tests/                   # Playwright E2E suite
```

---

## Key Commands

```bash
# Development
pnpm --filter @workspace/api-server run dev       # API server (builds then starts)
pnpm --filter @workspace/growth-os run dev        # Frontend (Vite HMR)

# Typecheck / build
pnpm run typecheck                                 # All packages
pnpm run build                                     # Typecheck + build all

# API codegen (after editing lib/api-spec/src/)
pnpm --filter @workspace/api-spec run codegen

# E2E tests
pnpm --filter @workspace/tests run test

# Demo data
pnpm --filter @workspace/scripts run seed:demo    # Seed sample pipeline data
```

---

## Running the App

### Dev (Replit workflows)

Four workflows run automatically:

| Workflow | Command | Port | Path |
|---|---|---|---|
| API Server | `pnpm --filter @workspace/api-server run dev` | 8080 | `/api` |
| Frontend | `pnpm --filter @workspace/growth-os run dev` | 18539 | `/` |
| Backup Worker | `pnpm --filter @workspace/backup-worker run dev` | — | — |
| Mockup Sandbox | `pnpm --filter @workspace/mockup-sandbox run dev` | 8081 | `/__mockup` |

The API server dev command builds the dist first, then runs the compiled output. Schema changes take effect on the next restart (startup migrations are idempotent).

### Production

Production runs the pre-built API bundle:
```bash
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

The frontend is served as a static site from `artifacts/growth-os/dist/public`.

---

## Environment Variables

### Required in production

| Variable | Description |
|---|---|
| `PORT` | API server port (set to `8080` by artifact config) |
| `SESSION_SECRET` | JWT signing secret — **must be ≥ 32 characters** |
| `PGHOST` | Replit Postgres host |
| `PGUSER` | Replit Postgres user |
| `PGPASSWORD` | Replit Postgres password |
| `PGDATABASE` | Replit Postgres database name |
| `PGSSLMODE` | **Set to `no-verify` in production only** (Replit managed Postgres needs SSL but uses self-signed cert) |

### First-deploy bootstrap (production)

| Variable | Description |
|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` | Admin account email for first deploy |
| `BOOTSTRAP_ADMIN_PASSWORD` | Admin account password for first deploy |

If neither is set when the `users` table is empty, a **cryptographically random one-time password** is generated and logged **once** to the deployment log. Set these before the first publish or check deployment logs immediately after to retrieve the generated password.

If only one is set, both are ignored (partial config is rejected) and random credentials are used.

### Optional / feature-gated

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | Enables AI Copilot | — (Copilot disabled) |
| `OPENAI_MODEL` | OpenAI model name | `gpt-4o` |
| `SENTRY_DSN` | Sentry error tracking | — (disabled) |
| `SMTP_HOST` | SMTP server for OTP emails | — (OTP email disabled) |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `SMTP_FROM` | Sender address | — |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Object storage bucket (backup worker, document uploads) | — |
| `PROBE_SECRET` | Secret for `GET /api/healthz/db` (monitoring probe) | — (endpoint returns 501) |
| `LOG_LEVEL` | Pino log level | `info` |

### Dev-only (auto-set or unused in prod)

| Variable | Notes |
|---|---|
| `NODE_ENV` | `development` in dev workflow, `production` in prod artifact |
| `REPLIT_DOMAINS` | Used to build allowed CORS origins in production |
| `BASE_PATH` | Frontend base path prefix (set by artifact config) |

---

## Database

### Connection

`lib/db/src/index.ts` — prefers individual `PG*` env vars over `DATABASE_URL`. SSL is controlled entirely by the `PGSSLMODE` env var (pg reads it natively). No `ssl` key is set in the Pool config.

```
Dev:        PGSSLMODE unset → no SSL (Replit Postgres helium, plain TCP)
Production: PGSSLMODE=no-verify → SSL with rejectUnauthorized:false
```

### Migrations

Migrations are **idempotent DDL** that run at every server startup inside `applyMigrations()` in `artifacts/api-server/src/index.ts`. All DDL uses `IF NOT EXISTS` / `IF NOT EXISTS` guards. `drizzle-kit push` is not used — do not reintroduce it (it cannot reach the DB from the shell and conflicts with the startup DDL pattern).

Schema changes: add new DDL to `applyMigrations()`, add the Drizzle column to `lib/db/src/schema/`, rebuild the API server.

### Per-request tenant isolation

`acquireRequestContext(companyId)` in `lib/db/src/index.ts`:

1. Acquires a dedicated `PoolClient` from the pool (bypasses the pool.query intercept)
2. Calls `set_config('app.company_id', companyId, false)` — session-level GUC
3. Returns `{ run, release }` helpers

The pool.query is intercepted via a monkey-patch: when inside a request async context (AsyncLocalStorage), all `db.*` Drizzle calls route through the per-request client, so the GUC is visible to every query.

RLS `company_isolation` policies on every table use `current_setting('app.company_id', true)::uuid` as the row filter. This is sufficient for the single-tenant deployment.

**No role switching** — `SET ROLE app_rls` / `RESET ROLE` was removed. Replit's managed Postgres doesn't allow the connecting user to assume a custom role. For a single-tenant app the GUC-based filter is equivalent.

### Transactions

`withCompanyTransaction(companyId, fn)` — sets GUC, opens `BEGIN`, runs `fn` (all `db.*` calls inside route to the transaction client via AsyncLocalStorage), `COMMIT` on success, `ROLLBACK` on error.

---

## Auth

- **Password login**: `POST /api/auth/login` — bcrypt compare, returns JWT
- **OTP login**: `POST /api/auth/otp/request` + `/api/auth/otp/verify` — 6-digit code, 10-minute expiry, email delivery (requires SMTP vars)
- **JWT**: RS256 (or HS256 with SESSION_SECRET), 24h expiry; `jti` stored in `session_blocklist` on logout
- **Roles**: `Admin` (full access, all deals) · `Member` (restricted to granted deals)
- **Per-deal access**: `target_access` table — Members see no deals until an Admin grants access. Creating a target auto-grants the creator.

### Middleware chain (`app.ts`)

```
Sentry → Helmet CSP → CORS → Auth rate limiter → API rate limiter
→ Pino HTTP logging → JSON body parser
→ /api/auth  (auth router, no requireAuth)
→ /api/launch (launch router, public)
→ /api  (requireAuth + companyContextMiddleware + main router)
→ Sentry error handler → generic 500 handler
```

---

## API Health Endpoints

| Endpoint | Auth | Behavior |
|---|---|---|
| `GET /api/healthz` | None | Always `{status:'ok'}` — liveness |
| `GET /api/readyz` | None | `{ready:false}` until migrations complete, then pool ping |
| `GET /api/healthz/db` | `X-Probe-Secret` header | DB connectivity check, returns 503 on failure |

---

## Production Deployment

### Publish flow

1. The frontend must be built into `artifacts/growth-os/dist/public` before publish
2. The API server bundle must be built into `artifacts/api-server/dist/`
3. Publish via Replit's deploy UI — this builds both and deploys

### First-deploy checklist

- [ ] `SESSION_SECRET` set as a production secret (≥ 32 chars)
- [ ] `PGSSLMODE=no-verify` set as a production-only env var
- [ ] `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` set (or be ready to retrieve generated password from deployment logs immediately after first deploy)
- [ ] `OPENAI_API_KEY` set if AI Copilot is needed
- [ ] `DEFAULT_OBJECT_STORAGE_BUCKET_ID` set if backup worker is running

### First login

On first deploy with an empty database:
- If `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` are set → use those credentials
- If not → a random password is generated, logged once to deployment logs, and the admin account is created at `admin@ringside.local`. Check deployment logs immediately — the password is not stored in plaintext anywhere after that log line.

---

## Key Architectural Decisions

### Supabase → Replit Postgres (PGHOST)

Supabase's connection pooler became unreachable from async tasks (ENOTFOUND on the pooler hostname). The DB layer was switched to Replit Postgres using individual `PG*` env vars (`PGHOST/PGUSER/PGPASSWORD/PGDATABASE`). `DATABASE_URL` is still accepted as a fallback but `PG*` vars take priority.

### SSL: PGSSLMODE env var (not Pool config)

Multiple attempts to set `ssl: { rejectUnauthorized: false }` in the Pool config failed in production (pg's internal client chain didn't thread it through). The working solution: **no ssl key in Pool config at all** — pg reads `PGSSLMODE` natively via `readSSLConfigFromEnvironment()`. `PGSSLMODE=no-verify` is set as a production-only env var in Replit's secrets.

Dev has no `PGSSLMODE` set → pg defaults to no SSL → works with Replit's helium host over plain TCP.

### app_rls role removed

Originally the code used `SET ROLE app_rls` on every request to force PostgreSQL to apply RLS policies (superusers bypass RLS unconditionally). This failed in production because Replit's managed Postgres doesn't allow the connecting user to assume a custom role — the `GRANT app_rls TO session_user` migration step fails silently.

**Resolution**: Removed `SET ROLE` / `RESET ROLE` entirely. For a single-tenant app with one `company_id`, the GUC-based `company_isolation` policies still correctly filter every row. The risk of superuser RLS bypass is irrelevant when all data belongs to one company.

The `app_rls` role creation/grant migration block was also removed from startup migrations.

### Startup migrations (not drizzle-kit)

`drizzle-kit push` cannot reach the database from the Replit shell (SSL configuration issues, no direct psql access). All DDL runs inside `applyMigrations()` at server startup using idempotent `IF NOT EXISTS` guards. This runs on every boot — it is safe and fast because no-op DDL in Postgres is cheap.

### First-run bootstrap seed

The admin bootstrap seed runs whenever the `users` table is empty, regardless of `NODE_ENV`. Credentials:
- Both `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` set → use them
- Partial config (only one set) → rejected, random credentials generated
- Neither set → `randomBytes(20).toString('base64url')` password, logged once to deployment logs

Static fallback passwords (`ChangeMe@Dev1`) were removed to avoid predictable production credentials.

### Connection management pattern

```
pool.connect()                    → dedicated PoolClient (bypasses intercept)
set_config('app.company_id', …)   → session GUC for RLS filtering
[pool.query intercept routes db.* calls through this client via AsyncLocalStorage]
release()                         → client.release() back to pool
```

The pool.query monkey-patch ensures all Drizzle ORM calls within a request go through the connection that has the GUC set, without needing to thread the client through every function call.

---

## RLS Policies

Every data table has a `company_isolation` policy:

```sql
CREATE POLICY company_isolation ON <table>
  USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
```

The `true` argument to `current_setting` makes it return NULL (not error) if the GUC is unset — this safely excludes all rows if the middleware hasn't set the GUC (e.g., migration queries run under the default company ID set at startup).

---

## Backup Worker

Runs every 6 hours. Dumps the full database with `pg_dump`, gzips it, uploads to object storage under `backups/db/YYYY-MM-DDTHH.sql.gz`. Retains the 14 most recent dumps. Requires `DEFAULT_OBJECT_STORAGE_BUCKET_ID` secret.

---

## Features Implemented

### Phase 1A — Target Detail Cockpit
Full target detail page with stage progression, scoring, interaction log, action items, and stage change audit trail.

### Phase 1B — Dashboard Intelligence + Pipeline
Executive dashboard with KPI tiles, needs-attention flags, pipeline stage chart, and top-priority list. Pipeline page with full filtering (stage, tier, owner, country, needs-attention toggle).

### Phase 2A — CSV / Excel Import Wizard
5-step import wizard at `/import`:
- Upload step: drag-and-drop or file browser for `.csv`, `.xlsx`, `.xls`
- Map Columns step: auto-detected column → field mapping with dropdown overrides
- Preview step: classified rows (create / update / skip) with changedFields shown for updates
- Apply step: creates new targets with milestone/stage-log, updates existing ones (stage-change logic reused from PUT /:id/stage)
- Done step: summary of created/updated/skipped with per-row error details
- Safety rules: never overwrite non-blank DB values with blank; never update targetCode on existing records; partial failures isolated per-row; invalid tier/stage skipped with reason

### Phase 3A — AI Copilot
Chat interface at `/copilot` backed by `POST /api/ai/ask`. Reads a live DB snapshot (targets, actions, interactions summary) and passes it as system context to OpenAI (model configurable via `OPENAI_MODEL`, default `gpt-4o`). Graceful 429/setup-required handling when quota is exhausted.

### Phase 4A — Action Command Center + Weekly Review

**Action Command Center** (`/actions`):
- Card-based mobile-first layout
- Groups: Overdue / Blocked / Due This Week / Upcoming / No Due Date / Recently Completed (14d)
- Filters: owner, priority, Must-Win toggle, Overdue Only toggle, text search
- New endpoint: `GET /api/actions/command-center` — enriches each action with `targetCode`, `priorityTier`, `currentStage`

**Weekly Review** (`/weekly-review`):
- 8 collapsible sections: Must-Win Opportunities, Needs Attention, Overdue Actions, Actions Due This Week, Stage Changes (last 7d), Recently Updated Targets, No Open Actions, No Interaction 30+ Days
- New endpoint: `GET /api/review/weekly` — single batch read (4 parallel DB queries)

### Phase 4B — Diligence Workspace + Deal Readiness

**Diligence Tab** (per-target): 8 workstream sections (Commercial/Financial/Legal/Tax/HR/Technology/Operations/Integration), readiness score, add/edit/delete items, separated from regular Actions by `workstream IS NULL` filter.

**Diligence Review** (`/diligence-review`): Pipeline-wide health — blocked, overdue, completion by target, missing workstreams.

Schema: `actions` table gained `workstream text` and `notes text` columns.

### Phase 7E — IC Log + Stage Gate UI

**IC Sessions Tab** (per-target): Lists IC sessions with outcome badges. Add/Delete sessions. Schema: `ic_sessions` table.

**Stage Gate Advisory**: Pre-flight `GET /api/targets/:id/stage-gate?newStage=X` renders advisory banner (pass/warn/block) in stage-change dialog.

### Phase 8F — NDA Register + Regulatory Clearance Map

**Compliance Tab** (per-target): NDA Register (counterparty, dates, scope, status) + Regulatory Clearance Map (CCI/RBI/SEBI/IRDAI/FEMA/DPDP/Sanctions/ABAC). Expiry and overdue alerts.

Schema: `nda_records`, `regulatory_clearances` tables.

### Phase 8H — In-App Notification Inbox

Bell icon with unread count. Notification types: stage stagnation (45d), overdue action, NDA expiring (30d), Must-Win no activity (14d). Idempotent 24h dedup. Schema: `notifications` table.

### Phase 8J — Drag-and-Drop Kanban

Cards draggable via `@dnd-kit/core`. Dropping on a different column opens a reason dialog before calling `PUT /api/targets/:id/stage`. Off-track columns (On Hold/Dropped/Rejected) are click-only.

### Phase 9A — Stakeholders Tab

Counterparty record, Internal Sponsors, External (Buy-side) Advisors, Counterparty (Sell-side) Advisors. Conflicts-check status with warning banner. Schema: `deal_advisors`, `deal_sponsors` tables + counterparty columns on `targets`.

### Phase 10A — Per-User Deal Visibility

Non-admin users see no deals until an Admin grants access. `target_access` table. `getAccessScope(req)` / `canAccessTarget(req, targetId)` helpers. Enforced in all list/detail endpoints. Admin console for managing access per-user.

### Engineering & Infrastructure

**Floating rail sidebar**: Collapsed width 56px (was 48px) — icon was clipping at 48px.

**Route-level code splitting**: 17 page imports converted to `React.lazy()` dynamic imports. Dashboard stays eagerly loaded.

**Playwright E2E Suite** (`tests/`): 25 tests — login, lazy chunk rendering (7 routes), target detail all 13 tabs, 4 navigation flows. JWT cached globally to avoid rate limiter.

**Corporate brand video**: 60s animated film in mockup-sandbox (`/__mockup`). 6 scenes, Framer Motion, cinematic audio.

---

## Target Detail — Tab Reference

| # | Tab | Icon | Phase |
|---|---|---|---|
| 1 | Overview | — | 1A |
| 2 | Log | — | 1A |
| 3 | Actions | — | 1A |
| 4 | Timeline | — | 1A |
| 5 | Diligence | ClipboardCheck | 4B |
| 6 | Documents | — | — |
| 7 | Valuation | — | — |
| 8 | Synergies | — | — |
| 9 | Activity | — | — |
| 10 | IC | Scale | 7E |
| 11 | Stakeholders | Users | 9A |
| 12 | Compliance | ShieldCheck | 8F |
| 13 | Audit | — | — |

---

## Checkpoints

| Label | Commit | Notes |
|---|---|---|
| working-supabase-read-write-baseline | 7243ed55 | Full stack working: API + React + seeded DB. DB uses Replit Postgres (helium). |
| fix-production-ssl-and-bootstrap | (Task #334) | SSL fixed via PGSSLMODE=no-verify; secure random bootstrap seed; app_rls graceful degradation |
| remove-apprls-role-switch | 085cea0034 | SET ROLE / RESET ROLE / app_rls migration block removed entirely; clean GUC-only connection pattern |
| rename-withRlsTransaction | 085cea0034 | Renamed to withCompanyTransaction to match actual behavior (no role switch) |
