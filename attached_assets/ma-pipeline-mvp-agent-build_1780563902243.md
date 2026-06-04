# TMG M&A Pipeline Tracker — Option A MVP Build Plan (Agent-driven, 2 days)

## Context

Surya (Principal — CDS, TMG) wants to build the **Option A MVP** of the M&A Pipeline Tracker — a working, deployable prototype **in 2 days** using Claude Code agents working in parallel. The MVP is scoped to the essential deal pipeline only: **no IC, no valuation, no AI, no analytics** (those ship in weeks 2–4).

**MVP scope locked:**
- Deal CRUD (create, read, update, delete) with 12-stage lifecycle machine
- 6 deal types with stage-variant defaults
- 9 basic workstreams (DD module) with status tracking, no redflag detail
- Team assignment and basic access control (RBAC only, no ABAC/conflicts-wall)
- Document upload to object store (S3 or MinIO)
- Kanban board (drag-drop stage transitions)
- Deal cockpit with tabs (Overview, Workstreams, Documents, Activity Log)
- Basic auth (email/password + JWT; no SSO/OTP in MVP)
- Audit log (append-only, basic events)
- Deploy to staging URL

**Not in MVP:**
- IC workflow
- Valuation framework
- AI (any phase)
- Analytics / reporting
- Learning loop
- Advanced auth (SSO, OTP, MFA)
- Conflicts wall / restricted-list
- Multi-tenancy (single-tenant for now)
- Hash-chain audit
- Postgres RLS

This is **deliberate scope reduction** — ship fast, iterate with real feedback, add sophistication later.

---

## Agent Build Plan

Three agents work in parallel over 2 days:

| Agent | Responsibility | Deliverables | Duration | Start |
|---|---|---|---|---|
| **Agent 1: Backend** | FastAPI backend, Postgres schema, endpoints, auth, stage logic | API source code, Postgres DDL, deployment Docker config | 16–18h | Day 1, 0800 |
| **Agent 2: Frontend** | Next.js SPA, React components, deal forms, kanban, cockpit UI | Frontend source code, component library, auth flow | 16–18h | Day 1, 0800 |
| **Agent 3: DevOps/Infra** | Supabase/Postgres setup, S3 bucket, CI/CD, staging deploy, monitoring | Cloud infrastructure config, CI/CD pipeline, monitoring dashboard | 8–10h | Day 1, 0800; Day 2 focuses on deploy |

**Parallel execution** → agents work independently on their modules; integration points pre-defined via OpenAPI contract.

---

## Pre-build Checklist (Questions for Surya)

Before agents spawn, I need decisions on these items. Some have defaults; others block the build.

| # | Decision | Impact | Default | Your choice | Status |
|---|---|---|---|---|---|
| **INFRASTRUCTURE** | | | | | |
| 1 | Cloud provider (AWS / Azure / GCP)? | Affects S3 vs Blob Storage, IAM config, networking | AWS (cheaper for MVP) | ? | **BLOCKING** |
| 2 | Database host (Supabase / Neon / RDS / on-prem)? | Affects deployment, backups, cost | Supabase (free tier works for MVP) | ? | **BLOCKING** |
| 3 | Where should the MVP live? (public URL for testing / internal VPN only) | Affects networking, TLS, firewall | Public URL with basic auth | ? | **BLOCKING** |
| **AUTH & ACCESS** | | | | | |
| 4 | Auth for MVP: email/password only, or integrate Azure AD now? | Scope & complexity. Email/password = 2h. Azure AD = 12h + Group IT coordination | Email/password (simple JWT) | ? | **BLOCKING** |
| 5 | Single tenant (CDS-only) or multi-tenant at launch? | Postgres RLS complexity; feature-gating; later migration cost | Single tenant for MVP | ? | **BLOCKING** |
| 6 | User roster: should I hard-code CDS team (5 users) or make it configurable? | MVP iteration speed. Hard-code = simpler; configurable = more flexible | Hard-code initial 5 CDS users | ? | **BLOCKING** |
| **DOMAIN SCOPE** | | | | | |
| 7 | For MVP: all 6 deal types enabled, or start with Acquisition only? | Reduces backend/frontend complexity. Can add types in week 2 | All 6 types (scope per Appendix A of spec) | ? | **MEDIUM** |
| 8 | Stage gate enforcement: full logic or simplified (just track, no validation)? | Affects backend complexity. Full gates = 2–3 hours; simplified = 30 min | Full logic (required inputs + approver checks per spec §7) | ? | **MEDIUM** |
| 9 | Workstreams: all 9 from spec, or simplified subset for MVP? | 9 workstreams = 1 table + basic UI; high value-add, low cost | All 9 (Financial, Legal, Tax, Commercial, Ops, HR, IT, ESG, Regulatory) | ? | **MEDIUM** |
| 10 | Document upload: full versioning or simple (latest only)? | Versioning = 2–3 hours extra; simple = 30 min | Simple (latest only) for MVP; versioning in week 2 | ? | **LOW** |
| **INTEGRATIONS & FEATURES** | | | | | |
| 11 | Document storage: S3 (AWS) / MinIO (on-prem) / Azure Blob? | Depends on cloud choice. S3 = standard; MinIO = simpler on-prem; Blob = Azure lock-in | S3 if AWS; MinIO if on-prem; Blob if Azure | ? | **BLOCKING** |
| 12 | AI Phase 1 in MVP, or skip for week 2? | MVP without AI is still valid. With AI = +6h but high impact | Skip for MVP (add in week 2 with full pipeline) | ? | **MEDIUM** |
| 13 | Email notifications (stage change, new deal, etc.) or in-app only? | In-app only = 0 hours; email = 2–3 hours | In-app only for MVP; email in week 2 | ? | **LOW** |
| 14 | Slack/Teams integration: now or later? | Skip for MVP (add in week 2) | Skip for MVP | ? | **LOW** |
| **TIMELINE & VALIDATION** | | | | | |
| 15 | When is "done"? EOD Day 2, or when you're ready to UAT with CDS team? | Affects definition of MVP. EOD Day 2 = basic functionality; UAT-ready = +1 day | EOD Day 2 = deployable staging URL + CDS team can log in and create 1 test deal | ? | **BLOCKING** |
| 16 | Post-MVP iteration: do you want me to maintain the codebase, or hand off to a team/contractor? | Affects code structure, documentation, testing depth | I maintain for weeks 2–4 (you give feedback, I iterate) | ? | **BLOCKING** |
| **COST & HOSTING** | | | | | |
| 17 | Budget for cloud costs (Supabase, S3, etc.) during MVP? | MVP baseline ≈ $20–50/month on free tiers + small paid add-ons | Assumed zero spend (free tiers); you cover overages | ? | **MEDIUM** |
| 18 | Can you provide access to cloud account (AWS / Azure / GCP), or should I create trial accounts? | Affects deployment speed. Own account = fast; trial = potential restrictions | I'll create trial accounts if you don't have them | ? | **MEDIUM** |

---

## Decision Gates (blocking vs. non-blocking)

**I cannot start building until I have clarity on items marked BLOCKING:**

- **#1** Cloud provider
- **#2** Database host (Supabase vs. Neon vs. RDS)
- **#3** Public URL or internal
- **#4** Email/password or Azure AD (critical: Azure AD requires IT coordination)
- **#5** Single-tenant for MVP
- **#6** Hard-coded CDS roster or configurable
- **#11** Document storage (S3 / MinIO / Blob)
- **#15** Definition of "done" (EOD Day 2 or later)
- **#16** Who maintains post-MVP

**Non-blocking items** have sensible defaults — I can assume them and you can override in week 1 if needed.

---

## Detailed Agent Responsibilities

### **Agent 1: Backend (FastAPI + Postgres + Auth)**

**Duration:** 16–18 hours

**Deliverables:**
1. `requirements.txt` — FastAPI, SQLAlchemy, Pydantic, pytest, python-dotenv, boto3 (or MinIO), psycopg2, jwt, etc.
2. Postgres schema (DDL):
   - `tenants` (single row for MVP, but schema prepped for multi-tenancy)
   - `users` (hard-coded CDS team initially)
   - `deals` (with deal_type, current_stage, etc.)
   - `deal_acls` (team assignment)
   - `workstreams` (9 types, basic status)
   - `documents` (metadata; content in object store)
   - `audit_events` (append-only, no hash-chain)
3. API endpoints (OpenAPI 3.1 contract):
   - POST `/auth/login` (email/password)
   - POST `/auth/logout`
   - GET `/deals` (list, with pagination)
   - POST `/deals` (create)
   - GET `/deals/{deal_id}` (read)
   - PATCH `/deals/{deal_id}` (update)
   - POST `/deals/{deal_id}/stage-transition` (move stage with gate checks)
   - GET `/deals/{deal_id}/workstreams`
   - PATCH `/deals/{deal_id}/workstreams/{workstream}` (update status)
   - POST `/deals/{deal_id}/documents/upload` (S3/MinIO presigned URL)
   - GET `/deals/{deal_id}/audit-log`
   - GET `/health` (for monitoring)
4. Stage machine logic:
   - Stage transition guards (required inputs per stage from spec §7)
   - Approver validation
5. Auth:
   - JWT token issuance/validation
   - Password hashing (bcrypt)
   - Session timeout (8 hours)
6. Deployment:
   - `Dockerfile` (Python 3.12 + FastAPI)
   - `docker-compose.yml` (Postgres + FastAPI + optional MinIO)
   - `.env.example` (config template)
7. Tests:
   - Unit tests on stage machine logic
   - Integration tests on CRUD endpoints
   - Target ≥60% coverage (reduced from spec's ≥80% due to MVP scope)

**Key decisions from pre-build:**
- #4 (auth): Affects JWT flow
- #11 (S3 vs MinIO): Affects import statements, presigned URL logic
- #7 (all 6 deal types): Affects schema enum, stage-variant logic

---

### **Agent 2: Frontend (Next.js + React + TypeScript)**

**Duration:** 16–18 hours

**Deliverables:**
1. `package.json` — Next.js 15, React 19, TypeScript, Tailwind, shadcn/ui, react-beautiful-dnd (kanban), react-query, axios
2. Page structure:
   - `/` (landing / dashboard — list of deals)
   - `/auth/login` (email/password form)
   - `/deals` (kanban board by stage)
   - `/deals/[deal_id]` (deal cockpit with tabs)
   - `/deals/[deal_id]/overview` (name, team, documents count, etc.)
   - `/deals/[deal_id]/workstreams` (9 workstreams, status, owner)
   - `/deals/[deal_id]/documents` (upload + list)
   - `/deals/[deal_id]/activity` (audit log)
   - `/deals/new` (create deal form)
   - `/settings` (user prefs — not in MVP but shell ready)
3. Components:
   - `DealForm` (create/edit deal, sector/type picker, stage dropdown)
   - `KanbanBoard` (drag-drop by stage; optimistic update)
   - `DealCard` (on kanban; shows name, lead, stage, workstream count)
   - `DealCockpit` (tab navigation, content lazy-loaded)
   - `WorkstreamList` (table, status badges, owner)
   - `DocumentUpload` (drag-drop or file picker; calls backend presigned URL)
   - `ActivityLog` (read-only timeline)
   - `StageTransitionModal` (gate check feedback + confirm button)
4. Layout & shell:
   - Top nav (logo, user menu, logout)
   - Sidebar (main nav: Dashboard, Deals, Help)
   - Error boundary + loading states
5. Auth integration:
   - Login form → POST `/auth/login` → store JWT in `localStorage`
   - Auth guard: redirect to login if no JWT or JWT expired
   - API client adds JWT to headers
6. API client:
   - `lib/api.ts` — Axios instance with auth header, error handling, retry logic
7. Styling:
   - Tailwind + shadcn/ui theme
   - Responsive (desktop-first, basic mobile fallback)
   - Accessibility: WCAG 2.1 AA target (basic)
8. Tests:
   - Component tests (React Testing Library) on key forms/modals
   - Target ≥40% coverage for MVP (reduced; will grow in later sprints)

**Key decisions from pre-build:**
- #4 (auth): Affects login flow
- #5 (single-tenant): Affects tenant-picker in nav (not in MVP, hidden)
- #7 (all 6 deal types): Affects type picker dropdown

---

### **Agent 3: DevOps / Infrastructure**

**Duration:** 8–10 hours (Day 1: setup; Day 2: deploy & validate)

**Deliverables:**
1. Cloud infrastructure:
   - Supabase/Neon project setup (Postgres, auto-backups, analytics)
   - S3 bucket (or MinIO setup if on-prem) with CORS, versioning disabled for MVP
   - IAM roles (for app to write documents, read/write DB)
2. CI/CD:
   - GitHub Actions workflow (`.github/workflows/deploy.yml`):
     - Trigger: push to `main`
     - Steps: lint (ruff, prettier), test (pytest + jest), build (Docker), deploy (to staging)
   - Branch protection: require passing tests before merge
3. Monitoring & logging:
   - Basic CloudWatch / Application Insights / Datadog dashboard (free tier)
   - Log aggregation: stdout → CloudWatch
   - Health check: `/health` endpoint polled by load balancer
4. Deployment target:
   - Staging: Docker container on Heroku / Railway / Render (free tier or low-cost)
   - Expose at `https://tmg-pipeline-mvp-staging.herokuapp.com` (example)
5. Configuration management:
   - `.env` file (database URL, S3 credentials, JWT secret)
   - Secrets vault: store in GitHub Secrets or cloud provider's secret manager
   - Safe defaults in `.env.example`
6. Database migrations:
   - Alembic (SQLAlchemy) for schema versioning
   - Migration script: `python -m alembic upgrade head`
7. Documentation:
   - `DEPLOY.md` — how to deploy, rollback, access logs
   - `ARCHITECTURE.md` — high-level diagram, module boundaries
   - `API.md` — OpenAPI spec rendered from FastAPI

**Key decisions from pre-build:**
- #1 (cloud provider): Affects all infrastructure choices
- #2 (Supabase vs. RDS): Affects database setup, backups
- #3 (public vs. internal): Affects TLS, network config, firewall rules
- #11 (S3 vs. MinIO): Affects object-store deployment
- #15 (done by EOD Day 2): Affects validation checklist

---

## Build Schedule (2-day timeline)

### **Day 1 (Wednesday, assume start 0800)**

| Time | Agent 1 (Backend) | Agent 2 (Frontend) | Agent 3 (DevOps) |
|---|---|---|---|
| 0800–0900 | Read spec, setup repo, create branch | Read spec, setup Next.js project | Create cloud accounts, provision Supabase + S3 |
| 0900–1200 | Write Postgres schema (DDL), create migration | Build auth pages, layout shell, nav | Setup CI/CD, Docker, GitHub Actions |
| 1200–1300 | *Lunch break* | *Lunch break* | *Lunch break* |
| 1300–1700 | FastAPI scaffold, auth endpoints, CRUD endpoints | Deal forms, create/edit flow | Deploy Docker image to staging (test run) |
| 1700–2100 | Stage machine logic, gate validation, tests | Kanban + DealCard, basic styling | Monitoring setup, health check wired |
| 2100–2400 | Polish API, document integration, final tests | Polish forms, error handling, responsive check | Prod-ready config, backups tested |
| **EOD Day 1** | **API live on staging** | **Frontend live on staging** | **Infrastructure ready** |

### **Day 2 (Thursday, assume start 0800)**

| Time | Agent 1 (Backend) | Agent 2 (Frontend) | Agent 3 (DevOps) |
|---|---|---|---|
| 0800–1200 | Bug fixes from integration tests, workstream endpoints | Integration fixes, API client wiring, auth flow | Full end-to-end smoke test |
| 1200–1300 | *Lunch break* | *Lunch break* | *Lunch break* |
| 1300–1700 | Audit log, document upload finalization | Deal cockpit tabs, activity log display | Performance testing (load test 50 concurrent users) |
| 1700–2100 | Final tests, API contract validation, handoff docs | Final polish, accessibility audit | Deploy to prod (or staging if you want extended UAT) |
| 2100–2200 | *Standby for integration bugs* | *Standby for integration bugs* | *Standby for production issues* |
| **EOD Day 2** | **Full API contract live** | **Full SPA live, all features working** | **Staging/prod URL live, monitoring active** |

---

## Verification Checklist (EOD Day 2)

**Can Surya / CDS team actually use the MVP?**

- [ ] Frontend URL loads (no 404)
- [ ] Can log in with email/password (hard-coded CDS user: `surya@tmg.com` / `password123`)
- [ ] Dashboard shows empty deal list
- [ ] Can create a new deal: fill form (name, sector, deal-type, team), click Create
- [ ] Deal appears on kanban board in "Sourced" stage
- [ ] Can drag deal to "NDA" stage → backend validates required inputs (NDA doc + expiry) → move succeeds or error shows
- [ ] Can open deal cockpit: Overview, Workstreams, Documents, Activity tabs all render
- [ ] Can upload a document: select file → presigned URL → progress bar → file appears in list
- [ ] Can assign workstream owner: pick a workstream, select owner from dropdown, save
- [ ] Activity log shows all actions (deal created, stage moved, workstream updated, document uploaded)
- [ ] API `/health` responds `200 OK`
- [ ] All logs (stdout, database) appear in monitoring dashboard
- [ ] Mobile (iPhone) can log in and view a deal (basic responsive test)

**If all pass:** MVP is live. CDS can use it as-is; we iterate week 2 (IC, valuation, AI).

---

## Post-Build Handoff

**By EOD Day 2, you will have:**

1. **Source code repos** (GitHub private):
   - `tmg-pipeline-backend` (FastAPI + Postgres)
   - `tmg-pipeline-frontend` (Next.js)
   - `tmg-pipeline-infra` (Terraform / CloudFormation optional for week 2)

2. **Live staging URL:**
   - `https://tmg-pipeline-staging.example.com`
   - Test login: `surya@tmg.com` / `password123`

3. **Documentation:**
   - `README.md` (quick start, deployment)
   - `API.md` (OpenAPI contract)
   - `ARCHITECTURE.md` (system design, agent responsibilities)
   - `ROADMAP.md` (week 2–4 additions)

4. **Monitoring:**
   - Dashboard link (CloudWatch / Datadog / etc.)
   - Alert threshold: high error rate triggers Slack notification

5. **CI/CD:**
   - Push to `main` automatically tests and deploys to staging
   - Manual approval button to promote to prod (when ready)

---

## Week 2–4 Backlog (not in MVP)

| Feature | Effort | When |
|---|---|---|
| IC workflow (proposal, voting, CPs) | 3 days | Week 2 |
| Valuation framework (DCF, comps, history) | 2 days | Week 2 |
| AI Phase 1 screen (Anthropic SDK integration) | 2 days | Week 3 |
| Document versioning + redaction state | 1 day | Week 2 |
| Analytics dashboards (funnel, time-in-stage) | 3 days | Week 3 |
| Learning loop (verdict tagging at close) | 2 days | Week 4 |
| Email notifications (stage change, assignment) | 1 day | Week 2 |
| Postgres RLS + multi-tenancy | 2 days | Week 4 |
| Azure AD SSO integration | 2 days | Week 2 (if ready) |
| Workstream redflags (full detail, escalation) | 2 days | Week 3 |

---

## Decision Summary for Surya

**Before I spawn agents, I need you to answer these 9 questions** (the others have defaults):

1. **Cloud provider?** (AWS / Azure / GCP)
2. **Database host?** (Supabase [recommended] / Neon / RDS)
3. **Public URL or internal only?**
4. **Auth: email/password only, or Azure AD now?**
5. **Document storage: S3 / MinIO / Azure Blob?**
6. **All 6 deal types in MVP, or Acquisition only?**
7. **Do you have cloud account access, or should I create trial accounts?**
8. **Who maintains the code after Day 2?** (I iterate weeks 2–4, or you hand off to a team?)
9. **Definition of "done":** EOD Day 2 (basic), or wait for UAT validation?

Once you answer those, I spawn 3 agents at 0800 tomorrow and you have a live staging URL EOD tomorrow evening.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Database schema too complex for 2 days | Scope slip | Pre-defined schema (in spec §31); agent follows exactly |
| Frontend/backend integration bugs | Delays cutover | Shared OpenAPI contract; integration tests on Day 2 morning |
| Cloud account setup delays | Blocks deployment | I use trial accounts if you can't provide access; migrate later |
| Auth scope grows (Azure AD pressure) | Day 2 slip | Stick to email/password MVP; Azure AD is week 2 (planned already) |
| S3 / MinIO integration complexity | Document upload fails | Pre-tested; client-side presigned URL flow is standard |
| Testing depth insufficient | Bugs in week 2 | Accept ≥60% coverage for MVP (not ideal, but acceptable for 2-day sprint) |

---

## Success Metrics (what "done" looks like)

By EOD Day 2:
- ✓ Staging URL live and accessible
- ✓ CDS team can log in
- ✓ Can create a deal, move through 3+ stages with validation
- ✓ Can upload documents
- ✓ Audit log captures all actions
- ✓ API contract (OpenAPI) validated
- ✓ CI/CD pipeline working (push to main → test → deploy)
- ✓ Monitoring + alerting live
- ✓ Zero critical bugs (bugs acceptable; crashes not)
