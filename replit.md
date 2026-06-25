# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

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
- Import button added to Pipeline page header
- Backend: `POST /api/import/validate` + `POST /api/import/apply` at `/api/import/*`
- Safety rules: never overwrite non-blank DB values with blank; never update targetCode on existing records; partial failures isolated per-row; invalid tier/stage skipped with reason

### Phase 3A — AI Copilot
Chat interface at `/copilot` backed by `POST /api/ai/ask`. Reads a live DB snapshot (targets, actions, interactions summary) and passes it as system context to OpenAI (model configurable via `OPENAI_MODEL`, default `gpt-4o`). Graceful 429/setup-required handling when quota is exhausted.

### Phase 4A — Action Command Center + Weekly Review

**Action Command Center** (`/actions`):
- Card-based mobile-first layout replacing the old desktop table
- Groups: Overdue / Blocked / Due This Week / Upcoming / No Due Date / Recently Completed (14d)
- Filters: owner dropdown, priority dropdown, Must-Win toggle, Overdue Only toggle, text search
- Quick Complete / Reopen buttons reuse existing `PUT /api/actions/:id`
- New endpoint: `GET /api/actions/command-center` — enriches each action with `targetCode`, `priorityTier`, `currentStage` (via left join on targets + milestones)

**Weekly Review** (`/weekly-review`):
- 8 collapsible sections, all rendered with empty states even when empty
- Sections: Must-Win Opportunities, Needs Attention, Overdue Actions, Actions Due This Week, Stage Changes (last 7d), Recently Updated Targets, No Open Actions, No Interaction 30+ Days
- New endpoint: `GET /api/review/weekly` — single batch read (4 parallel DB queries) → 8 computed arrays
- Refresh button with timestamp
- No-interaction guardrail: newly created targets (<30d old) are never flagged

**Nav**: Weekly Review added to sidebar with CalendarCheck icon.

### Phase 4B — Diligence Workspace + Deal Readiness

**Diligence Tab** (per-target, inside Target Detail at `/targets/:id`):
- 5th tab "Diligence" with ClipboardCheck icon in Target Detail
- 8 collapsible workstream sections: Commercial, Financial, Legal, Tax, HR, Technology, Operations, Integration
- Readiness Score card: % complete progress bar, blocked/overdue/missing workstream counts
- Add Item dialog: workstream, description, owner, due date, priority, status, notes fields
- Edit Item dialog: same fields, pre-filled from existing item
- Quick Complete / Reopen buttons per item; Delete with confirmation dialog
- Items isolated from regular Actions tab (workstream IS NULL vs IS NOT NULL filter)
- Component extracted to `target-detail-diligence.tsx` for maintainability
- New backend routes: `GET /api/targets/:id/diligence`, `POST /api/targets/:id/diligence`

**Diligence Review** (`/diligence-review`):
- Pipeline-wide diligence health view with collapsible sections
- Sections: Must-Win Incomplete, Blocked Items, Overdue Items, Completion by Target (progress bars), Missing Workstreams, Recently Completed (14d)
- Per-target progress bars colored by completion % (red → amber → blue → green)
- All rows link to the target detail Diligence tab
- Refresh button with timestamp
- New backend endpoint: `GET /api/diligence/review` (diligence router)

**Schema changes**:
- `actions` table: added `workstream text` and `notes text` nullable columns (applied via direct SQL)
- OpenAPI: new `diligence` tag, 3 new paths, 7 new schemas (DiligenceReadiness, DiligenceTabResponse, CreateDiligenceItemBody, DiligenceReviewTargetSummary, DiligenceReviewItem, DiligenceReviewResponse)
- `workstream` and `notes` fields added to ActionItem, CreateActionBody, UpdateActionBody

**Other updates**:
- `GET /api/actions/open` and `GET /api/actions/command-center` now filter `workstream IS NULL` (diligence items excluded from Action Command Center)
- `GET /api/targets/:id/actions` filters `workstream IS NULL` (keeps Actions and Diligence tabs cleanly separated)
- `PUT /api/actions/:id` extended to accept `workstream` and `notes` (handles diligence item edits)

**Nav**: Diligence Review added to sidebar with ClipboardCheck icon.

### Phase 7E — IC Log + Stage Gate UI

**IC Sessions Tab** (per-target, inside Target Detail at `/targets/:id`):
- 6th tab "IC" with Scale icon in Target Detail
- Lists IC sessions with outcome badges (Approved green, Rejected red, Conditional amber, Deferred grey)
- Add Session dialog: session date, attendees, outcome, conditions, notes
- Delete session with confirmation
- New backend routes: `GET /api/targets/:id/ic-sessions`, `POST /api/targets/:id/ic-sessions`, `DELETE /api/ic-sessions/:id`

**Stage Gate Advisory** (in stage-change dialog):
- Pre-flight `GET /api/targets/:id/stage-gate?newStage=X` called when a stage-change is initiated
- Renders advisory banner (pass/warn/block) with checklist items inside the Confirm Stage Change dialog

**Schema changes**:
- `ic_sessions` table added: id, target_id, session_date, attendees, outcome, conditions, notes, created_at
- OpenAPI: new `ic` tag, 3 new paths, `IcSession` and `CreateIcSessionBody` schemas

**Database migration**:
- Switched from Supabase pooler (became unreachable) to Replit Postgres (PGHOST)
- `lib/db/src/index.ts` now prefers `PGHOST/PGUSER/PGPASSWORD/PGDATABASE` env vars over `DATABASE_URL` secret
- `artifacts/api-server/src/index.ts` runs idempotent startup migrations (rename `action_items`→`actions`, create `milestones`, `deal_documents`, `ic_sessions` tables with IF NOT EXISTS guards)

### Phase 9A — Stakeholders Tab (Counterparty & Advisor Management)

**Stakeholders Tab** (per-target, inside Target Detail at `/targets/:id`):
- 7th tab "Stakeholders" with Users icon in Target Detail
- **Counterparty section**: structured record — legal entity name, CIN/reg no., founders, key management, controlling shareholders, website, notes; editable via Edit dialog
- **Internal Sponsors section**: list of internal champions — name, role/title, email, notes; Add/Edit/Delete
- **External Advisors (Buy-side)**: advisor type, firm name, contact, engagement date, fee structure, conflicts-check status (Pending/Cleared/Flagged); Add/Edit/Delete
- **Counterparty Advisors (Sell-side)**: same structure; tracked for negotiation visibility
- Flagged advisor warning banner shown at top of tab when any advisor has conflicts_status = "Flagged"
- Component extracted to `target-detail-stakeholders.tsx`

**Backend routes**:
- `GET/PUT /api/targets/:id/counterparty` — structured counterparty fields
- `GET/POST /api/targets/:id/advisors` — list and create advisors (buy-side and sell-side)
- `PUT/DELETE /api/advisors/:id` — update/delete advisor
- `GET/POST /api/targets/:id/sponsors` — list and create internal sponsors
- `PUT/DELETE /api/sponsors/:id` — update/delete sponsor

**Schema changes**:
- `deal_advisors` table: id, target_id, side, advisor_type, firm_name, contact_name, contact_email, engagement_date, fee_structure, conflicts_status, notes, created_at
- `deal_sponsors` table: id, target_id, name, role_title, email, notes, created_at
- Counterparty columns added to `targets` via ALTER TABLE: cp_cin, cp_founders, cp_key_management, cp_controlling_shareholders, cp_website, cp_notes
- OpenAPI: new `advisors` and `sponsors` tags; 7 new paths; 8 new schemas

### Phase 8F — NDA Register + Regulatory Clearance Map

**Compliance Tab** (per-target, inside Target Detail at `/targets/:id`):
- 8th tab "Compliance" with ShieldCheck icon in Target Detail
- **NDA Register section**: table of NDA records per deal — counterparty, effective date, expiry date, scope (One-way / Mutual), confidentiality term (months), document reference/link, status (Active / Expired / Extended); Add/Edit/Delete NDA record; NDAs expiring within 30 days shown with amber badge; expired NDAs shown in red
- **Regulatory Clearance Map section**: structured list of clearance items; each item has: category (Antitrust-CCI / RBI / SEBI / IRDAI / FEMA-FDI / DPDP / Sanctions-PEP / ABAC / Other), description, owner name, status (Not Required / Pending / Filed / Cleared / Blocked), target clearance date, evidence document link, notes; Add/Edit/Delete item; overdue items (past target date, not cleared) flagged red
- Global alert banner shown at top of tab if any NDA is expiring/expired or any clearance is overdue/blocked
- Component extracted to `target-detail-compliance.tsx`

**Backend routes**:
- `GET/POST /api/targets/:id/nda-records` — list and create NDA records
- `PUT/DELETE /api/nda-records/:id` — update/delete NDA record
- `GET/POST /api/targets/:id/regulatory-clearances` — list and create clearance items
- `PUT/DELETE /api/regulatory-clearances/:id` — update/delete clearance item

**Schema changes**:
- `nda_records` table: id, target_id, counterparty, effective_date, expiry_date, scope, term_months, doc_reference, status, notes, created_at
- `regulatory_clearances` table: id, target_id, category, description, owner_name, status, target_clearance_date, evidence_reference, notes, created_at, updated_at
- OpenAPI: new `compliance` tag; 6 new paths; 6 new schemas (NdaRecord, CreateNdaRecordBody, UpdateNdaRecordBody, RegulatoryClearance, CreateRegulatoryClearanceBody, UpdateRegulatoryClearanceBody)

## Checkpoints

| Label | Commit | Notes |
|---|---|---|
| working-supabase-read-write-baseline | 7243ed55 | Full stack working: API + React frontend + seeded DB. DB uses Replit Postgres (helium) with fallback from any supabase DATABASE_URL secret. |

### Phase 8H — In-App Notification Inbox

**Notification Bell** (mobile header, all pages):
- Bell icon with unread count badge (red, hides when 0) in top mobile header
- Clicking opens dropdown panel: unread notifications listed first, each with icon, title, body, timestamp, blue dot; "Mark all read" button
- Clicking a notification navigates to the relevant deal/tab and marks it read
- Auto-generates notifications on app load if last generation > 15 min ago (localStorage TTL)

**Generation engine** (`POST /api/notifications/generate`) — 4 check types:
- **Stage stagnation**: active deal in current stage > 45 days with no progression
- **Action overdue**: open (non-diligence) action past its due date
- **NDA expiring**: active NDA with expiry_date within 30 days
- **Must-Win no activity**: Must-Win deal with no interaction logged in 14+ days
- All checks are idempotent: deduplication within 24h per type+target combo

**Backend routes**: `POST /api/notifications/generate`, `GET /api/notifications`, `GET /api/notifications/unread-count`, `PUT /api/notifications/:id/read`, `PUT /api/notifications/read-all`

**Schema**: `notifications` table (id, target_id nullable, type, title, body, link_path, is_read, created_at) added via startup migration

**OpenAPI + codegen**: 5 new paths; 3 new schemas (AppNotification, NotificationGenerateResult, UnreadCountResult); hooks generated

### Phase 8J — Drag-and-Drop Kanban

**Draggable deal cards** on Kanban board (`/pipeline` → Kanban view):
- Cards in active pipeline stage columns are draggable via `@dnd-kit/core` (PointerSensor with 8px threshold to avoid accidental drags on tap)
- Off-track column cards (On Hold / Dropped / Rejected) are click-only links, not draggable; column is collapsed by default
- Drag overlay shows a floating rotated card while dragging; droppable columns highlight with primary glow when hovered during drag
- Dropping on a different column opens **KanbanStageChangeDialog** — reason select with preset options plus "Other" with free-text fallback — before any API call is made
- On confirm: calls existing `PUT /api/targets/:id/stage` with `changeReason`; success toast + query invalidation; error toast on failure with card snapping back
- Library: `@dnd-kit/core` + `@dnd-kit/utilities` added to `@workspace/growth-os`
