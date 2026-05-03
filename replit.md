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

## Checkpoints

| Label | Commit | Notes |
|---|---|---|
| working-supabase-read-write-baseline | 7243ed55 | Full stack working: API + React frontend + seeded DB. DB uses Replit Postgres (helium) with fallback from any supabase DATABASE_URL secret. |
