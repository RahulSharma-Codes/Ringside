# Ringside — M&A Deal Intelligence Platform

**Manipal Group · Corporate Development & Strategy**

## Overview

Full-stack M&A deal management platform. pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **Frontend**: React 19 + Vite + TailwindCSS + shadcn/ui
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (Replit Postgres via PGHOST)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- **Build**: esbuild (CJS bundle)
- **Testing**: Playwright E2E (`tests/` workspace package)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- Schema changes are applied by the API server's idempotent startup migrations on boot (`artifacts/api-server/src/index.ts`). The `drizzle-kit push` path was removed — do not reintroduce it (it conflicts with the startup DDL).
- `pnpm --filter @workspace/tests run test` — run Playwright E2E suite

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

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
- `actions` table: added `workstream text` and `notes text` nullable columns
- OpenAPI: new `diligence` tag, 3 new paths, 7 new schemas
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
- OpenAPI: new `compliance` tag; 6 new paths; 6 new schemas

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

### Phase 10A — Per-User Deal Visibility

**Access model**:
- Non-admin users see NO deals until an Admin explicitly grants access; Admins always see all deals.
- `target_access` table: `id, targetId, userId, grantedBy, grantedAt` (+ `companyId` via RLS), unique on `(targetId, userId)`.
- `getAccessScope(req)` / `canAccessTarget(req, targetId)` / `grantTargetAccess(...)` helpers in `artifacts/api-server/src/lib/target-access.ts`. Admin role bypasses; everyone else needs an explicit grant row.
- Creating a target auto-grants the creator access to it.

**Enforced in**: `routes/targets.ts` (list, summary, by-stage, top-priority, needs-attention, get-by-id), `routes/review.ts` (`/weekly` — all 4 parallel queries), `routes/diligence.ts` (`/review`), `routes/actions.ts` (`/open`, `/command-center`). Each short-circuits to an empty/zeroed response when a non-admin has zero grants, rather than passing an empty id list into `inArray(...)`.

**Admin-only management routes**:
- `GET/POST /api/targets/:id/access`, `DELETE /api/targets/:id/access/:userId` — per-target grant list.
- `GET/PUT /api/admin/users/:id/access` — per-user checklist (replace-all-grants) — backs the Admin Console "Access" dialog on the Users list (`pages/admin.tsx`), a simple checkbox list of all deals.

**OpenAPI**: new `access` tag; 4 new paths; `TargetAccessGrant`, `GrantTargetAccessBody`, `UserAccessList` schemas.

---

## Engineering & Infrastructure

### Nav Bar Fix + Performance (code splitting)

**Floating rail sidebar icon clipping fix**:
- Collapsed width increased from `w-12` (48px) to `w-[56px]` (56px) in `FloatingRail` (`components/layout.tsx`)
- Root cause: 48px container − 2px border − 16px nav padding = 30px for a 32px (`w-8`) icon; fix gives 38px clear

**Route-level code splitting** (`App.tsx`):
- 17 page imports converted from static to `React.lazy()` dynamic imports
- Dashboard stays eagerly loaded (always the first page after login)
- All lazy routes share a single `<Suspense fallback={<PageLoader />}>` in `Router`
- Eliminates parse/eval cost of all secondary pages on initial load

**Dashboard query cleanup** (`pages/dashboard.tsx`):
- "Total Pipeline" KPI now reads `summary.activeTargets` (from the fast `/api/targets/summary` call) instead of waiting for the full `useListTargets` response

### Playwright E2E Test Suite (`tests/` workspace package)

25 tests across 4 groups, run with `pnpm --filter @workspace/tests run test`:

**Login (1 test)**: fills email/password in headless Chromium, asserts dashboard appears.

**Lazy-loaded route chunks (7 tests)**: direct URL navigation to each page asserts real content is rendered (not the Suspense spinner fallback) — covers Dashboard, Pipeline List, Pipeline Board (after toggle), Actions Command Center, AI Copilot, Weekly Review, Diligence Review.

**Target Detail — all 13 tabs (13 tests)**: Overview, Log, Actions, Timeline, Diligence, Documents, Valuation, Synergies, Activity, IC, Stakeholders, Compliance, Audit. Tab assertion strategy: click → wait for `aria-selected="true"` → wait for `.animate-pulse` skeletons to detach → assert active panel has content. This avoids the race where the old panel's text satisfies a generic poll before the new panel finishes loading.

**Navigation flows (4 tests)**: Dashboard → Pipeline, Dashboard → Actions, Pipeline → Target Detail (conditional skip if no cards visible), Target Detail → Actions tab.

Key decisions:
- Nav links selected by `href` attribute (`a[href="/pipeline"]`) not accessible name — collapsed rail hides label text with `display:none`
- Chromium resolved via `which chromium` at config load time; env override takes priority
- Global setup fetches a JWT once per suite run and caches it to avoid rate-limiter (30 req/15 min)
- CORS: `api-server` always allows `http://localhost` so headless Chromium can reach the auth endpoint

---

## Target Detail — Tab Reference

The target detail page (`/targets/:id`) has 13 tabs:

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

## Corporate Brand Video

60-second animated product launch film for Ringside. Lives in the Canvas / mockup-sandbox artifact at `/__mockup`. Stack: React + Framer Motion, dark navy palette (`#06090f`), Inter font.

**Structure** — 6 scenes, 60 seconds total:

| Scene | Duration | Headline copy | Feature shown |
|---|---|---|---|
| 1 — Opening | 9s | *"Every great acquisition starts with the right intelligence."* | RINGSIDE brand reveal + stat counters |
| 2 — Dashboard | 10s | *"Your entire pipeline — scored, staged, and surfaced instantly."* | KPI tiles, stage distribution bars, attention banner |
| 3 — Pipeline | 10s | *"Move deals forward. Drag, drop, and record your reasoning."* | Kanban board with deal cards and tier badges |
| 4 — Diligence | 10s | *"8 workstreams, one view. Nothing falls through the cracks."* | Workstream grid with progress bars and blocked states |
| 5 — AI Copilot | 10s | *"An AI advisor who has read every deal, action, and interaction."* | Chat panel with typing-dots animation |
| 6 — Closing | 11s | *"Deal intelligence, built for the Manipal Group Corporate Development team."* | RINGSIDE wordmark + 8 feature chips |

**Animation approach**: all transitions use GPU-composited `transform` + `opacity` only. No `filter:blur` or `clipPath` animations in continuous loops. Headline lines use `overflow:hidden` wrappers with `y: '105%' → 0` clip reveals. Numbers use a custom `Counter` component with RAF-based easing.

**Audio**: AI-generated 65-second ambient instrumental track (`public/audio/ringside_bg.mp3`) — cinematic dark pads, 60 BPM. Auto-plays on load; mute toggle button (🔊) bottom-right. Scene counter (1/6) top-right; timeline progress bar at bottom.

**Files**:
- `artifacts/mockup-sandbox/src/components/video/VideoTemplate.tsx` — container, audio, progress bar
- `artifacts/mockup-sandbox/src/components/video/Counter.tsx` — animated number counter
- `artifacts/mockup-sandbox/src/lib/video/hooks.ts` — `useVideoPlayer` with elapsed-time tracking
- `artifacts/mockup-sandbox/src/components/video/video_scenes/Scene{1–6}.tsx` — individual scenes

---

## Checkpoints

| Label | Commit | Notes |
|---|---|---|
| working-supabase-read-write-baseline | 7243ed55 | Full stack working: API + React frontend + seeded DB. DB uses Replit Postgres (helium) with fallback from any supabase DATABASE_URL secret. |
