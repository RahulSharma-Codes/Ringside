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

---

## Project Task Log

All tasks that have been completed or are awaiting approval, in order. Tasks are grouped by area. Refs link to the project task system.

### ✅ Completed — Core Platform Build

| # | Task | Why it was done |
|---|---|---|
| #1 | Phase 1A: Opportunity Detail Cockpit | Foundation of the app — full target detail page with stage progression, scoring, interaction log, action items, and audit trail |
| #2 | Phase 1A QA Validation | Code review pass after Phase 1A to catch regressions and polish UX before moving forward |
| #13 | Phase 2A: CSV / Excel Import Wizard | Teams needed to bulk-load existing pipeline data from spreadsheets rather than entering deals one by one |
| #22 | Phase 4B: Diligence Workspace + Deal Readiness | Structured 8-workstream diligence tracking per deal with completion scoring and a pipeline-wide review page |
| #41 | Phase 6A: AI Assist Layer | AI Copilot chat interface backed by live DB snapshot sent to OpenAI — answers deal questions instantly |
| #42 | Phase 6A: AI Layer fixes (code review) | Follow-up code review to fix issues found after Phase 6A merged |
| #43 | Phase 6B: Deal Journey & Score UX | Score display, deal journey timeline, and score confidence badges surfaced through the UI |
| #44 | Phase 6B: Auth Architecture & Launch Readiness | JWT auth, rate limiting, CORS, Sentry, and hardened session management wired up for production |
| #50 | Phase 7A: Kanban Pipeline Board View | Alternate pipeline view showing deals as draggable cards in stage columns |
| #51 | Phase 7B: Deal Type + ESG & Regulatory Workstreams | Deal-type field (Public M&A / Private / Asset) with stage variants; ESG and Regulatory diligence workstreams |
| #52 | Phase 7C: Stage Gate Enforcement (Backend) | Pre-flight stage gate checks that warn or block stage moves based on readiness criteria |
| #53 | Phase 7D: Deal Activity Log | Unified activity feed showing interactions, stage changes, and notes per deal |
| #54 | Phase 7E: IC Log + Stage Gate UI | IC sessions tab per deal; stage gate advisory shown in the stage-change dialog |
| #61 | Valuation Module | Structured valuation tab with multiple methods, ranges, and rationale |
| #62 | Synergies Register | Synergies tab with revenue, cost, and financial synergy line items |
| #63 | IC Voting Workflow | IC voting on proposals with vote records and outcome tracking |
| #64 | Pipeline Analytics Dashboards | Charts and KPIs for pipeline health, stage distribution, and deal velocity |
| #65 | Export & Report Generation | CSV/PDF export of deal data with column selection |
| #66 | NDA Register + Regulatory Clearance Map | Compliance tab with NDA expiry tracking and regulatory clearance status |
| #67 | Deal-Type Stage Variants | Stage list adapts per deal type (public vs private vs asset deal stages differ) |
| #68 | In-App Notification Inbox | Bell icon with unread count; 4 notification types auto-generated (stagnation, overdue, NDA expiry, Must-Win silence) |
| #69 | Counterparty & Advisor Management | Stakeholders tab with counterparty record, internal sponsors, buy-side and sell-side advisors |
| #70 | Drag-and-Drop Kanban | `@dnd-kit` drag with reason dialog before any stage change is committed |
| #71 | Tamper-Evident Audit Store | DB-level REVOKE prevents the API process from ever UPDATE/DELETE-ing audit_events rows |
| #72 | Multi-Tenancy Foundation | RLS `company_isolation` policies on all tables; `app.company_id` GUC set per request |
| #73 | Authentication Upgrade — Email OTP + SSO Stub | OTP 6-digit email login flow; SSO stub endpoint for future OIDC integration |
| #74 | Learning Loop & Doctrine Dashboard | Phase 1 verdict accuracy tracking and deterioration alerts |
| #75 | AI Phases 4 & 5 — Valuation Sanity-Check + DD Synthesis | AI sanity-checks valuation against comps; AI synthesises diligence findings |
| #76 | Document Security Tiers & Classification | Document vault with Highly-Restricted / Restricted / Internal / Public tiers |

### ✅ Completed — UX Polish & Incremental Features

| # | Task | Why it was done |
|---|---|---|
| #3 | Add a way to delete individual interactions and actions | Missing CRUD — users couldn't remove incorrect log entries |
| #4 | Make the Change Stage button accessible on mobile | Button was off-screen on small viewports; critical action for mobile users |
| #14 | Let users download a template CSV | Users needed a correctly-formatted file to import rather than guessing column names |
| #18 | Auto-map template columns perfectly when template is re-imported | Friction: users re-uploading the template CSV had to remap every column manually |
| #24 | Add diligence completion to the Weekly Review report | Weekly Review was missing diligence status; teams needed it in one place |
| #25 | Add document/evidence attachment links to diligence items | Items needed a URL link field for evidence without requiring file upload infrastructure |
| #32 | Premium pipeline stage visualization & stage movement UX | Stage rail redesigned; smoother, clearer stage movement dialog |
| #33 | Add click-to-navigate from stage cards on the dashboard board | Dashboard stage tiles were informational-only; clicking should navigate to filtered pipeline |
| #35 | Keep stage filter active when navigating back to pipeline | Filter was resetting on back navigation — frustrating in typical review workflows |
| #36 | Show visual indicator on stage cards when they are clickable | Cards looked static; hover state and cursor cues added |
| #37 | Make stage cards keyboard-accessible with focus ring | Accessibility gap — mouse-only interaction |
| #89 | Show which columns will be in the export before downloading | Users were exporting to find out what was included; preview added to export dialog |
| #93 | Show deal-type stage variant as a badge on each target card | Stage name alone was ambiguous across deal types |
| #95 | Add deal-type filter to Weekly Review and Diligence Review | Teams reviewing only Public M&A deals couldn't filter; had to scroll through all |
| #101 | Log how advisor conflicts were resolved | Conflict-check had no resolution notes field; regulators need a paper trail |
| #102 | Export the Doctrine dashboard to a shareable PDF | Learning Loop data needed to be shareable offline in board presentations |
| #103 | Show historic Phase 1 verdict accuracy trends over time | Point-in-time accuracy wasn't enough; trend line shows if predictions are improving |
| #104 | Surface verdict tags on each deal's overview tab | Verdict data existed in the DB but wasn't visible anywhere on the deal detail page |
| #105 | Prevent a deal card from disappearing during slow drag-and-drop save | Optimistic UI update removed the card before the server confirmed — race condition on slow connections |
| #106 | Let users reorder cards within a stage column by dragging | Stage columns had no ordering; teams wanted to prioritise within a stage |
| #112 | Prevent database tampering via audit_events | API-level guard wasn't enough; DB-level REVOKE added for belt-and-suspenders |
| #113 | Add deal-type filter to the Action Command Center | Action Command Center had no deal-type filter; mixed deal types made prioritisation hard |
| #115 | Let deal teams generate an IC memo draft with one click | IC prep was manual; AI-drafted memo sections from live deal data saves hours |
| #116 | Show AI analysis history | Previous AI runs were overwritten; teams needed to compare current vs prior assessments |
| #121 | Prevent data leaking between companies | Multi-tenancy groundwork — RLS policies ensure one company cannot see another's data |
| #122 | Let admins invite teammates by email | New users had no path to join other than sharing a password; proper invite flow added |
| #126 | Flag when Phase 1 accuracy is deteriorating | Accuracy trend alert so teams know when their scoring model needs recalibration |
| #129 | Send OTP code by email instead of showing it on screen | OTP was displayed in the API response (dev shortcut) — security gap for production |
| #130 | Protect Admin panel and critical API routes from Members | Members could call write endpoints directly; role guard on all admin routes |
| #131 | Let admins create and manage user accounts | No user management UI existed; admins had to rely on bootstrap env var |
| #132 | Prevent expired or logged-out sessions from passing auth check | JTI blocklist check was missing on session validation; logout wasn't fully enforced |
| #138 | Show deal-type variant badge on Weekly Review and Diligence Review | Consistency — badge was on pipeline cards but not on review page rows |
| #140 | Prevent login from failing silently when email server is misconfigured | SMTP errors were swallowed; users saw a generic error with no actionable message |
| #142 | Make login work when SMTP is partially configured | Partial SMTP env vars (e.g., host set but no user) caused a crash instead of a graceful fallback |
| #153 | Fix broken type errors in Stakeholders tab | TypeScript errors were blocking clean builds after the Stakeholders feature merged |
| #154 | Split oversized core files to unblock parallel development | Single 3000-line files were causing merge conflicts and making parallel task work impossible |
| #155 | Add a deal health traffic-light to every pipeline card | Teams needed at-a-glance risk signal (Green/Amber/Red) without opening the deal |
| #156 | Generate a print-ready IC briefing pack from live deal data | IC meetings needed a formatted PDF pulling live deal data automatically |
| #157 | Log a call or meeting directly from the pipeline card | Friction — users had to open a deal to log an interaction; quick-log from card added |
| #158 | Let each team member see only their own deals and actions | Per-user deal visibility grants; non-admins see no deals until explicitly granted access |
| #159 | Visual uplift — dashboard, pipeline cards, and target header | Design refresh pass on the three highest-traffic surfaces |

### ✅ Completed — Production Infrastructure

| # | Task | Why it was done |
|---|---|---|
| #334 | Fix production 500s and first-run bootstrap | Every API request was returning 500 in production due to `SET ROLE app_rls` failing; no admin user was being created on fresh deploy. Fixed by: (1) graceful role degradation, (2) unconditional empty-DB seed with cryptographically random one-time password |
| #338 | Remove SET ROLE workaround — clean up request context | The graceful-degradation approach from #334 was still complex machinery that never worked in production. Removed entirely: no `SET ROLE`, no `RESET ROLE`, no app_rls migration block. Clean GUC-only pattern is sufficient for single-tenant deployment |
| #339 | Rename withRlsTransaction to withCompanyTransaction | After removing the role switch, the function name implied RLS role enforcement that no longer existed — misleading for future developers |

---

### 🕐 Pending Approval — Import

| # | Task | What it does |
|---|---|---|
| #17 | Let users also download a pre-filled Excel template (.xlsx) | Currently only CSV template is downloadable; Excel format is more familiar to deal teams |
| #19 | Warn users when they upload a file with unmapped (skipped) columns | Silent skips mean data loss; user should be warned before apply |
| #23 | Add bulk import of diligence checklists from templates | Copy a standard diligence checklist template into a deal with one action |

### 🕐 Pending Approval — Diligence

| # | Task | What it does |
|---|---|---|
| #26 | Show a diligence completion progress bar on each target card | Inline completion % on pipeline cards without opening the deal |
| #27 | Add diligence completion percentage to each target's detail page header | Header-level summary so teams see readiness before clicking into the tab |
| #29 | Let users attach evidence links directly from the diligence review page | Currently evidence links require opening the deal; should be addable inline |
| #30 | Show evidence link count on the diligence item in the weekly review | Visibility of how much evidence is attached without opening the deal |
| #31 | Validate that evidence link URLs are real before saving | URLs are saved without checking format or reachability |
| #57 | Include ESG and Regulatory workstreams in the Diligence Review | Two workstreams were added in Phase 7B but not wired into the Diligence Review page |

### 🕐 Pending Approval — Pipeline & Kanban

| # | Task | What it does |
|---|---|---|
| #34 | Show days-in-stage for all stages on the progression rail | Currently only current stage shows days; historical stage durations hidden |
| #38 | Let users copy and share a pipeline link with filters applied | Sharing a filtered view requires the recipient to manually re-apply filters |
| #39 | Remember the last pipeline view when the app is reopened | View preference (List vs Kanban, active filters) resets on every page load |
| #40 | Make progression rail stage buttons show a focus ring | Keyboard accessibility gap on the stage progression UI |
| #56 | Let users edit deal type from the target detail page | Deal type is set on creation but can only be changed via import; no in-app edit UI |
| #107 | Make sure drag-and-drop stage changes can't be lost on a bad connection | Stage drop on poor connection can appear to succeed but the server update fails silently |
| #160 | Show the current rank position on each Kanban card while reordering | When dragging to reorder within a column, users lose track of the card's position |
| #161 | Let users reset a column back to default order (by priority score) | After manual reordering, there's no way to restore the default priority-score order |
| #162 | Carry Kanban order through to Weekly Review and Action Command Center | Manual card order is only reflected in Kanban; list views still use default sort |
| #166 | Filter pipeline by health status (At Risk / On Track) | No way to instantly surface all At Risk deals without scrolling the full pipeline |
| #254 | Confirm drag-and-drop Kanban still works after navigating away and back | Regression test — DnD state may not reinitialise cleanly after React router navigation |

### 🕐 Pending Approval — Scoring & Dashboard

| # | Task | What it does |
|---|---|---|
| #45 | Apply the score nullable migration to stop showing default scores | Unscored deals show `0` as if they were assessed; should show "Not scored" |
| #46 | Let users set scores directly from the target detail overview | Score editing requires the full edit dialog; inline score widget would be faster |
| #47 | Carry the score confidence badge through to pipeline card and target list views | Confidence badge exists on detail page but is absent from the pipeline card |
| #55 | Show deal type breakdown chart on the dashboard | Dashboard KPIs have no breakdown by deal type; chart would show portfolio mix |
| #260 | Surface deal score trends over time | Point-in-time scores don't show trajectory; trend line shows whether portfolio quality is improving |

### 🕐 Pending Approval — Notifications

| # | Task | What it does |
|---|---|---|
| #96 | Let users control which types of alerts they receive | All 4 notification types fire for all users; no per-user preference controls |
| #97 | Show notifications as a dedicated inbox page | Current bell dropdown is small; a full inbox page would be more usable |
| #98 | Keep the unread badge accurate in real time without manual refresh | Badge only updates on page load; missed notifications until next refresh |

### 🕐 Pending Approval — Stakeholders & Advisors

| # | Task | What it does |
|---|---|---|
| #99 | Surface flagged advisor conflicts in the Weekly Review | Conflict flags exist per deal but don't roll up into the weekly review |
| #100 | Let users export a deal's stakeholder list as a CSV | No export path for stakeholder/advisor data; needed for legal/compliance |

### 🕐 Pending Approval — Doctrine & Learning Loop

| # | Task | What it does |
|---|---|---|
| #108 | Let users filter the Doctrine PDF export by date range | Full Doctrine export includes all history; date range would scope to a period |
| #109 | Include deal-by-deal accuracy breakdown per sector in the Doctrine report | Aggregate accuracy hides sector-level differences in prediction quality |
| #124 | Let users drill into the deals behind each accuracy data point | Accuracy charts show numbers but don't link to the underlying deals |
| #125 | Export the accuracy trend chart as part of the Doctrine PDF | Chart is web-only; operators presenting to boards need it in the PDF |
| #127 | Let teams correct or update a verdict after a deal is closed | Verdicts are set at close but can't be amended if the initial classification was wrong |

### 🕐 Pending Approval — Audit & Compliance

| # | Task | What it does |
|---|---|---|
| #110 | Show the audit trail across all deals in one compliance-ready export | Audit events are per-deal; no cross-deal audit report for compliance purposes |
| #111 | Prevent silent audit failures from hiding when a write fails | Audit event writes can fail without surfacing an error to the API caller |

### 🕐 Pending Approval — Documents & Security

| # | Task | What it does |
|---|---|---|
| #118 | Show Highly-Restricted documents in the pipeline-wide Document Review page | Highly-Restricted docs are filtered out of the review page; should be visible to Admins |
| #119 | Enforce Highly-Restricted download protection when auth is in place | Download guard currently checks auth but doesn't enforce tier restrictions in production |
| #120 | Let users filter the document vault by classification tier | No tier filter on the document list; users scroll through all tiers to find restricted docs |

### 🕐 Pending Approval — Filters & Preferences

| # | Task | What it does |
|---|---|---|
| #114 | Remember the last-used deal-type filter across page visits | Filter resets on every navigation; preference should persist per session |
| #133 | Remember which export columns were last used | Column selection resets every export; teams use the same columns every time |
| #134 | Let users export only the deals currently visible (with search/filter) | Export always includes all deals regardless of active filters |
| #139 | Filter pipeline stage dropdown to only valid stages for the selected deal type | Stage dropdown shows all stages regardless of deal type; invalid stages cause errors |

### 🕐 Pending Approval — Valuation

| # | Task | What it does |
|---|---|---|
| #117 | Prevent valuation sanity-check from returning 'insufficient data' for active deals | AI sanity-check bails with "insufficient data" even when meaningful valuation data exists |

### 🕐 Pending Approval — Admin & User Management

| # | Task | What it does |
|---|---|---|
| #135 | Prevent admins from accidentally deleting their own account | No guard on self-delete; an admin can remove themselves and lock everyone out |
| #136 | Let admins edit a user's display name without re-inviting them | Display name can only be set at invite time; no edit UI after creation |
| #137 | Prevent the last admin from being downgraded or deleted | If the only admin is removed, the app becomes unmanageable |
| #141 | Let admins configure SMTP settings from inside the app | SMTP requires env var changes and a redeploy; in-app config would be faster |

### 🕐 Pending Approval — Auth & Session Security

| # | Task | What it does |
|---|---|---|
| #143 | Prevent Members from reaching write-only pages (Import, New Target) | Frontend routes for Import and New Target are accessible to Members who shouldn't be able to write |
| #144 | Lock down API write endpoints so Members can't modify data via direct API calls | Role guard on read routes; write routes lack a Member exclusion check at the API level |
| #145 | Confirm that logging out truly blocks further API access — end-to-end test | Logout is implemented but no e2e test verifies the token is actually blocked server-side |
| #146 | Prevent revoked tokens from passing after a server restart | JTI blocklist lives in the DB but the in-memory cache is cleared on restart; window of vulnerability |
| #123 | Keep all deals accessible even if the RLS GUC is accidentally unset | If `set_config` fails silently, the GUC is empty and RLS filters out every row — users see a blank app |

### 🕐 Pending Approval — IC Brief

| # | Task | What it does |
|---|---|---|
| #168 | Add a deal-summary narrative block to the IC brief | IC brief lacks a human-readable summary section; AI or manual notes should fill it |
| #169 | Let the IC brief open to a specific deal without requiring a second login | Shared IC brief links require the recipient to log in again before seeing the deal |
| #170 | Include NDA status and regulatory clearance alerts in the IC brief | IC brief doesn't surface compliance red flags that IC members need to know |
| #187 | Pre-populate the IC Proposal form with the AI-drafted memo sections | IC Proposal form is blank; AI memo sections should pre-fill the relevant fields |

### 🕐 Pending Approval — AI & Analysis

| # | Task | What it does |
|---|---|---|
| #191 | Auto-rerun AI analysis after significant diligence changes | AI analysis is run manually; stale results shown after major diligence updates |

### 🕐 Pending Approval — UX / Empty States

| # | Task | What it does |
|---|---|---|
| #177 | Add empty-state icons to all blank list pages | Blank pages with just "No items" text; icons and guidance make the first-use experience clearer |
| #203 | Show the alert threshold line on the PDF export too | Alert threshold is shown on the web chart but not on the exported PDF version |
| #236 | Extend rich text notes to compliance, stakeholder, and valuation tabs | Rich text is available in some tabs but not in Compliance, Stakeholders, or Valuation |

### 🕐 Pending Approval — Deal Health

| # | Task | What it does |
|---|---|---|
| #128 | Show the Deal Verdict on target cards in the pipeline view | Verdict badge exists on deal detail but is absent from the pipeline list and Kanban card |
| #167 | Include deal health ratings in the Weekly Review PDF export | Health traffic-lights are on Kanban cards but not in the Weekly Review PDF |

### 🕐 Pending Approval — Infrastructure & Reliability

| # | Task | What it does |
|---|---|---|
| #287 | Confirm backup restore works end-to-end before a real incident requires it | Backup uploads run automatically but the restore path has never been tested; needed before any production incident |
