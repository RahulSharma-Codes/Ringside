# Ringside — Sprint 2: Production Release Readiness

**To:** Replit Agent
**From:** Rahul Sharma, Manipal Corp Dev
**Date:** 2026-07-22
**Current head:** `9cbb45c` ("feat: wire Sentry error monitoring into API server + backup worker (task #295)")
**Sprint 1 status:** ✅ Complete — all 6 criticals and 9 highs closed. Build + typecheck clean. 1 residual CVE (see Task #296).

---

## Sprint 2 goal

**Move Ringside from 🟡 CONDITIONAL GO → 🟢 GO for enterprise production release.**

Sprint 1 closed every security and data-integrity blocker. Sprint 2 closes the remaining engineering gaps that block a confident production cutover: un-gated merges, no portability off Replit, three daily-use frontend bugs, no unit tests, and shallow E2E coverage. External gates (pentest, load test, DPA) run in parallel and are owned by Rahul — see §"Human gates" at the bottom.

**Sprint length:** 1 week of agent work. Tasks are ordered by dependency and risk; Task #296 is trivial and unblocks the rest.

---

## Task #296 — Final CVE clearance + SENTRY_DSN docs

### What & Why
Sprint 1 task #295 wired Sentry, which introduced `@opentelemetry/core` as a transitive dep. It carries GHSA-8988-4f7v-96qf (moderate — unbounded memory allocation in W3C Baggage propagation). One-line override closes Sprint 1's last open CVE. While in the area, document `SENTRY_DSN` and the backup-worker env vars in `.env.example`.

### Done looks like
- `pnpm audit --prod` returns **0 vulnerabilities**
- `.env.example` documents `SENTRY_DSN`, `BACKUP_SCHEDULE_CRON`, `BACKUP_RETENTION_DAYS`, `GCS_BUCKET_ID` (or whatever the backup worker reads)
- `docs/configuration.md` (created in Sprint 1) updated to mention Sentry + backup worker env vars

### Out of scope
- Anything else

### Steps
1. Add to `pnpm-workspace.yaml` under `overrides:`:
   ```yaml
   # Security: @opentelemetry/core unbounded memory allocation (GHSA-8988-4f7v-96qf)
   "@sentry/node>@opentelemetry/core": ">=2.8.0"
   ```
2. Run `pnpm install` to update lockfile, then `pnpm audit --prod` — confirm 0.
3. Append the four env vars above to `.env.example` with one-line descriptions.
4. Mention Sentry + backup-worker config in `docs/configuration.md`.

### Relevant files
- `pnpm-workspace.yaml` (`overrides:` block)
- `.env.example`
- `docs/configuration.md`

---

## Task #297 — Frontend daily-use bug fixes (HIGH-11, HIGH-12, HIGH-13)

### What & Why
Three frontend bugs that the deal team will hit on day one. None is a security issue, but each undermines trust in the data shown. Claude Code's audit caught all three; verification confirms none has been fixed yet.

### Done looks like
- Dragging a Kanban card to a new stage: the card lands and **stays** there; other screens (Pipeline list, Target Detail header) reflect the new stage within one refetch window — no manual reload needed (HIGH-11)
- Completing an action from the Command Center: the same action visible in the per-deal Actions tab reflects the new state on next render — and vice versa (HIGH-12)
- Dashboard KPI tiles and the stage-distribution chart show a distinct **"Couldn't load"** state (with a retry affordance) when their underlying request errors — no longer indistinguishable from a legitimate "0 deals" (HIGH-13)

### Out of scope
- Kanban keyboard accessibility (separate concern, deferred)
- Color-only health-dot signal (separate concern, deferred)
- Redesigning the dashboard layout

### Steps — HIGH-11 · Kanban optimistic update not synced to query cache
**Root cause:** `pipeline-kanban.tsx:538,597-600,739` keeps stage changes in a local `useState<Map>` called `optimisticStages`. The mutation succeeds against the API but the shared React Query cache is never invalidated, so any other screen reading `useListTargets` sees the old stage until a manual refetch.

1. In the Kanban stage-change mutation's `onSettled` (or `onSuccess` + `onError` pair), call:
   ```ts
   queryClient.invalidateQueries({ queryKey: getListTargetsQueryKey() });
   ```
2. Optionally keep the optimistic map for the immediate visual feedback, but clear the entry on `onSettled` so the local state doesn't drift from the cache.
3. Verify: open Kanban + Pipeline list side-by-side in two tabs; drag a card; confirm both reflect the new stage within ~2 seconds.

**Relevant files:** `artifacts/growth-os/src/pages/pipeline-kanban.tsx:538,597-600,739`; possibly `pipeline.tsx:185-201, 444, 475-476` (refresh callback wiring).

### Steps — HIGH-12 · Action completion cache sync between Command Center and per-deal Actions tab
**Root cause:** `actions.tsx:344` invalidates only `["actions-command-center"]`; `target-detail-actions.tsx:145` invalidates only `getListActionsQueryKey(targetId)`. Neither view knows about the other's query key, so a state change in one is invisible to the other until a manual reload.

1. In **both** files, extend the invalidation to cover both keys:
   ```ts
   // After any action mutation:
   queryClient.invalidateQueries({ queryKey: ["actions-command-center"] });
   queryClient.invalidateQueries({ queryKey: getListActionsQueryKey(targetId) });
   ```
   For the per-deal view, you may not have `targetId` in scope at the call site — pass it through or use a partial-match invalidation: `queryClient.invalidateQueries({ queryKey: ["actions"] })` if both keys share that prefix.
2. Verify: complete an action in Command Center, switch to that deal's Actions tab without reloading — completed state should be reflected.

**Relevant files:** `artifacts/growth-os/src/pages/actions.tsx:336-349`; `artifacts/growth-os/src/pages/target-detail-actions.tsx:138-145`.

### Steps — HIGH-13 · Dashboard distinguishes "empty" from "failed to load"
**Root cause:** `dashboard.tsx:119-136` destructures only `isLoading` from each `use*` hook. None destructures `isError` or `error`. When a request fails, `data` stays `undefined`, the rendering code coerces it to `0`/empty array, and the user sees the same UI as a legitimately empty pipeline.

1. For each dashboard hook, also destructure `isError` and `error`:
   ```ts
   const { data: summary, isLoading: loadingSummary, isError: summaryError } = useGetDashboardSummary({...});
   ```
2. For each KPI tile and the stage chart, render a distinct error state when the corresponding `isError` is true:
   - Icon: `AlertCircle` (already imported elsewhere in the app)
   - Copy: "Couldn't load [metric name]."
   - Action: a small "Retry" button that calls `refetch()` from the hook (you'll need to destructure `refetch` too)
3. Match the existing pattern already used in `weekly-review.tsx` — do not invent a new error component.

**Relevant files:** `artifacts/growth-os/src/pages/dashboard.tsx:119-136` and downstream render blocks for each metric.

---

## Task #298 — Bundle code-splitting (M2)

### What & Why
`target-detail-CSGWimfQ.js` is **1.1 MB (308 KB gzip)** and `index-CqHEfP9l.js` is **1.0 MB (307 KB gzip)**. Both exceed the recommended 244 KB raw budget. Vite already emits a warning on every build. The Target Detail page is the most-used screen in the app — every user pays this cost on first navigation. `jspdf.es.min` (380 KB) and `html2canvas.esm` (201 KB) are eagerly loaded but only used for PDF export (rare action).

### Done looks like
- `target-detail-*.js` chunk is under 500 KB raw
- `jspdf` and `html2canvas` are lazy-loaded only when the user clicks "Export to PDF" (or whatever triggers the export)
- Vendor chunks are split (`react-vendor.js`, `tanstack-vendor.js`, etc.) so the long-term cache survives app-code changes
- `pnpm run build` no longer prints the chunk-size warning

### Out of scope
- SSR / streaming (not relevant for a Vite SPA)
- Image optimization (separate concern)

### Steps
1. In `vite.config.ts`, add `build.rollupOptions.output.manualChunks` to split known vendors:
   ```ts
   manualChunks: {
     "react-vendor": ["react", "react-dom", "wouter"],
     "tanstack-vendor": ["@tanstack/react-query"],
     "framer-motion-vendor": ["framer-motion"],
   }
   ```
2. Find the PDF export entry point (likely in Target Detail or IC tab). Convert its static `import jsPDF from "jspdf"` and `import html2canvas from "html2canvas"` to dynamic imports inside the click handler:
   ```ts
   const handleClick = async () => {
     const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
       import("jspdf"), import("html2canvas"),
     ]);
     // ...existing logic
   };
   ```
3. Audit `target-detail-*.tsx` for further code-splitting opportunities — each of the 13 tabs is a candidate for `React.lazy()` if it isn't already.
4. Re-build, confirm chunk sizes.

**Relevant files:** `artifacts/growth-os/vite.config.ts`; the PDF export component (search for `jspdf` or `html2canvas` imports).

---

## Task #299 — CI/CD pipeline (B3)

### What & Why
No `.github/workflows/` exists. Every merge to `main` ships unverified. Sprint 1 added safety nets inside the app (Sentry, `/readyz`, migration failure → exit), but nothing prevents broken code from being merged in the first place. This is non-negotiable for production discipline.

### Done looks like
- Every PR to `main` triggers a GitHub Actions workflow that runs: typecheck, build, audit, typecheck, gitleaks (secret scan)
- Every push to `main` triggers the same workflow plus an E2E smoke run
- Failed checks block merge (branch protection rule)
- A CodeQL workflow runs on every PR for static security analysis

### Out of scope
- Deployment automation (Replit Autoscale handles this; CI doesn't need to deploy)
- Multi-environment promotion (staging → prod) — deferred until after initial release

### Steps
1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on:
     push: { branches: [main] }
     pull_request: { branches: [main] }
   jobs:
     verify:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v4
           with: { version: 10 }
         - uses: actions/setup-node@v4
           with:
             node-version: 24
             cache: pnpm
         - run: pnpm install --frozen-lockfile
         - run: pnpm run typecheck
         - run: PORT=3000 BASE_PATH=/ pnpm -r --filter "./artifacts/api-server" --filter "./artifacts/growth-os" --if-present run build
         - run: pnpm audit --prod --audit-level high
   ```
2. Create `.github/workflows/security.yml` for CodeQL + gitleaks:
   ```yaml
   name: Security
   on: [push, pull_request]
   jobs:
     codeql:
       runs-on: ubuntu-latest
       permissions: { security-events: write }
       steps:
         - uses: actions/checkout@v4
         - uses: github/codeql-action/init@v3
           with: { languages: javascript-typescript }
         - uses: github/codeql-action/analyze@v3
     gitleaks:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
           with: { fetch-depth: 0 }
         - uses: gitleaks/gitleaks-action@v2
   ```
3. Enable branch protection on `main` in GitHub settings (Rahul must do this — requires admin access):
   - Require status checks to pass before merge: `verify`, `codeql`, `gitleaks`
   - Require branches up to date before merging
   - Require 1 reviewer (optional but recommended)

**Relevant files:** new `.github/workflows/ci.yml` and `.github/workflows/security.yml`.

---

## Task #300 — Dockerfile + docker-compose (B4)

### What & Why
Deployment is Replit-only (`.replit`, `replit.nix`, Autoscale). There is no path to AWS/Azure/GCP/on-prem without writing infrastructure from scratch. A Dockerfile gives portability, makes local full-stack development reproducible, and is required by most enterprise procurement/security reviews. Docker Compose gives every developer an identical local environment in one command.

### Done looks like
- `docker build .` produces a working production image of the API server
- `docker compose up` starts: API server, Postgres, backup worker — all wired together
- The image runs as a non-root user
- The image is under 300 MB (multi-stage build, slim or distroless base)
- README documents how to run locally with Docker

### Out of scope
- Kubernetes manifests / Helm chart (deferred — Docker Compose is enough for now)
- Terraform / Bicep for cloud deployment (deferred — pick cloud after first release)
- Production-grade Postgres config (the compose file is for dev; prod uses Replit Postgres or managed RDS)

### Steps
1. Create `Dockerfile` (multi-stage):
   ```dockerfile
   # Build stage
   FROM node:24-slim AS build
   RUN corepack enable
   WORKDIR /app
   COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
   COPY artifacts/ lib/ scripts/ tests/ tsconfig*.json ./
   RUN pnpm install --frozen-lockfile
   RUN PORT=3000 BASE_PATH=/ pnpm -r --filter "./artifacts/api-server" --filter "./artifacts/growth-os" --if-present run build

   # Runtime stage
   FROM node:24-slim AS runtime
   RUN groupadd -r app && useradd -r -g app app
   WORKDIR /app
   COPY --from=build /app/artifacts/api-server/dist ./dist
   COPY --from=build /app/node_modules ./node_modules
   COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
   USER app
   ENV NODE_ENV=production
   EXPOSE 8080
   CMD ["node", "dist/index.js"]
   ```
2. Create `docker-compose.yml` with three services: `api`, `postgres` (postgres:16-alpine), `backup-worker`. Wire env vars so `api` connects to `postgres`, and `backup-worker` connects to both.
3. Add a `.dockerignore` (exclude `node_modules`, `dist`, `.git`, `tests/.auth`, `attached_assets`).
4. Add a "Local development with Docker" section to README.

**Relevant files:** new `Dockerfile`, `docker-compose.yml`, `.dockerignore`; update `README.md`.

---

## Task #301 — E2E test coverage gap (B5 part 1)

### What & Why
`replit.md` claims 25 Playwright E2E tests across 4 groups. Only **7** are committed (the `lazy-chunks` spec). Missing: Login (1), Target Detail tab assertions (13), Navigation flows (4). All 18 write-path operations (create/edit diligence item, create IC session, NDA record, Kanban drag-to-save, etc.) have **zero** automated coverage. A broken "Add" dialog would ship undetected — and since Task #299 adds CI but no tests run in it, CI alone won't catch these.

### Done looks like
- All 25 tests claimed in `replit.md` are committed and passing
- E2E suite runs in CI on every PR to `main` (as a separate job from `verify`, since it needs a running stack — see Task #299)
- At least the 5 highest-traffic write paths have explicit E2E coverage:
  1. Create new deal from `/pipeline` → "New Deal"
  2. Edit a diligence item's status (Target Detail → Diligence tab)
  3. Add an IC session (Target Detail → IC tab)
  4. Drag a Kanban card to a new stage (validates HIGH-11 fix stuck)
  5. Import a CSV via the Import Wizard

### Out of scope
- Full unit-test coverage (separate task, #302)
- Visual regression testing
- Cross-browser testing (Chromium-only is fine for an internal tool)

### Steps
1. **If the 18 missing specs exist locally on the original dev machine**, commit them. Otherwise, write them following the pattern in `tests/e2e/lazy-chunks.spec.ts`.
2. Add a new spec `tests/e2e/write-paths.spec.ts` for the 5 write paths above. Each test:
   - Logs in via the global-setup token (already cached)
   - Performs the write
   - Asserts the persisted result is visible after a refetch
3. In `.github/workflows/ci.yml` (from Task #299), add a separate `e2e` job that:
   - Builds the stack (or uses Docker Compose from Task #300)
   - Runs `pnpm --filter @workspace/tests run test`
   - Uploads the Playwright HTML report as an artifact on failure

**Relevant files:** `tests/e2e/`, `tests/playwright.config.ts`, `.github/workflows/ci.yml`.

---

## Task #302 — Unit test foundation (B5 part 2)

### What & Why
Zero unit tests exist anywhere in the repo. Critical business logic with no coverage: `target-access.ts` (the IDOR enforcement layer — `canAccessTarget`, `getAccessScope`), `health-score.ts` (the deal-health computation that drives the dashboard and AI Copilot context), import column-mapping, and stage-gate advisory rules. A bug in any of these ships silently.

### Done looks like
- Vitest is configured in the api-server workspace
- Unit tests exist and pass for:
  - `target-access.ts` — `canAccessTarget` for admin / non-admin / no-grant / multi-grant cases
  - `health-score.ts` — at least 5 representative score combinations
  - Import column-mapping logic — auto-detect + override paths
- `pnpm --filter @workspace/api-server run test` runs the suite
- Unit tests run in CI (Task #299) as part of the `verify` job

### Out of scope
- 100% coverage (target: cover the pure functions that encode business rules, not every route handler)
- Frontend unit tests (React Testing Library setup is a separate, larger effort)
- Snapshot testing

### Steps
1. Add `vitest` to `artifacts/api-server/package.json` devDeps. Add script `"test": "vitest run"`.
2. Create `artifacts/api-server/vitest.config.ts`:
   ```ts
   import { defineConfig } from "vitest/config";
   export default defineConfig({
     test: { environment: "node", include: ["src/**/*.test.ts"] },
   });
   ```
3. Write `artifacts/api-server/src/lib/target-access.test.ts` — test the four access-scope cases.
4. Write `artifacts/api-server/src/lib/health-score.test.ts` — test boundary scores (all-low, all-high, mixed, missing inputs).
5. Write `artifacts/api-server/src/routes/import.test.ts` (or wherever the mapping logic lives) — test column auto-detection and override.
6. Wire into `.github/workflows/ci.yml`: add `- run: pnpm --filter @workspace/api-server run test` to the `verify` job.

**Relevant files:** `artifacts/api-server/package.json`; new `vitest.config.ts`; new `*.test.ts` files alongside their source.

---

## Suggested sequencing

```
Day 1:  #296 (trivial CVE + docs) → #299 (CI scaffolding, even without all tests)
Day 2:  #297 (frontend bugs — highest user-visible impact)
Day 3:  #298 (bundle split) + #302 (Vitest setup + first tests)
Day 4:  #300 (Dockerfile + compose)
Day 5:  #301 (E2E write-path specs) + final verification
```

#299 should land early even without #301/#302 complete — typecheck + build + audit gates alone are a massive improvement over the current "merge and pray" workflow. Add test jobs to CI as #301 and #302 complete.

---

## Human gates (Rahul owns — parallel to Sprint 2)

These cannot be done by the Replit agent. They run in parallel with Sprint 2 and gate the final production cutover.

| # | Gate | Owner | Why it matters | Estimated lead time |
|---|---|---|---|---|
| H1 | **External penetration test** by a CERT-In empanelled auditor | Rahul | Required before exposing MNPI deal data to multiple users. Tests what code review cannot (logic flaws, chained exploits, IDOR in depth). | 1 week to scope + 1 week to execute |
| H2 | **Load test** (k6 against realistic deal volume) | Rahul + Replit support | Confirm p95 < 500ms at 500 concurrent users. Catches the HIGH-5 pagination fix and DB connection pool sizing. | 2 days to script + 1 day to run |
| H3 | **OpenAI DPA execution** | Rahul + Legal | AI Copilot sends deal data (targets, actions, interactions) to OpenAI for inference. This is MNPI leaving Manipal's perimeter. DPDP + M&A confidentiality angle. Until the DPA is signed, **disable the Copilot in production** by leaving `OPENAI_API_KEY` unset. | 2–4 weeks (legal lead time) |
| H4 | **Replit PITR answer** (§6.1 of the audit) | Rahul → Replit Support | Sprint 1's `backup-worker` gives RPO ≈ 24h. If Replit offers managed PITR, RPO drops to minutes and the custom worker becomes redundant. Decision needed: keep worker, switch to PITR, or run both. | Awaiting Replit reply |
| H5 | **Backup restore drill** | Rahul + Replit | Take one of the nightly `pg_dump` artifacts from Object Storage and restore it to a fresh Postgres instance. Time the restore. Verify row counts match. An untested backup is worse than none. | 1 day |
| H6 | **Branch protection on `main`** | Rahul (GitHub admin) | Task #299 sets up the CI workflows, but branch protection requires GitHub admin UI access. Without it, CI is advisory — developers can still merge with failing checks. | 5 minutes |
| H7 | **Session-secret rotation** | Rahul (Replit Secrets) | Generate a fresh `SESSION_SECRET` ≥ 32 chars and set it in Replit Secrets. The hardcoded `"dev-secret-change-me"` is now blocked in production (CRIT-2 fix), so without a real secret the server will refuse to boot. | 5 minutes |

---

## Production-release checklist

Run this checklist the day before cutover. Every item must be ✅ or explicitly waived with a documented reason.

### Code & build
- [ ] `pnpm run typecheck` — clean
- [ ] `pnpm run build` (all artifacts) — clean
- [ ] `pnpm audit --prod` — 0 vulnerabilities
- [ ] Sprint 2 tasks #296–#302 complete and merged

### Security
- [ ] `SESSION_SECRET` set in Replit Secrets (≥ 32 chars, randomly generated)
- [ ] `NODE_ENV=production` set in Replit Autoscale env
- [ ] `REPLIT_DOMAINS` set to the production domain(s) only
- [ ] `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` configured (else OTP returns 503)
- [ ] `OPENAI_API_KEY` unset until H3 (DPA) is signed — Copilot disabled
- [ ] `SENTRY_DSN` set and receiving test events
- [ ] `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` set on first deploy only, then unset
- [ ] Gitleaks scan clean (no credentials in repo or git history — Sprint 1 scrub held)

### Infrastructure
- [ ] First backup from `backup-worker` visible in Object Storage under `backups/db/`
- [ ] Restore drill (H5) completed successfully with documented RTO
- [ ] `/healthz` returns 200 immediately on boot
- [ ] `/readyz` returns 200 only after migrations complete
- [ ] Autoscale health check configured against `/readyz` (not `/healthz`) — confirm with Replit if this is configurable

### Process
- [ ] External pentest (H1) — no Critical or High findings open
- [ ] Load test (H2) — p95 < 500ms at target concurrency
- [ ] Branch protection (H6) — CI checks required before merge
- [ ] Runbook drafted for: backup restore, Sentry alert triage, Replit deploy rollback

### Sign-off
- [ ] Rahul (Corp Dev sponsor)
- [ ] Manipal IT/Infosec (if applicable)
- [ ] Replit (deployment confirmation)

---

## After release — Sprint 3 candidates (deferred, do not block release)

These are real improvements but not release-blockers:
- Full Drizzle migration system (replace startup DDL — currently dormant tech debt)
- `company_id` added to Drizzle schema types (HIGH-10 — currently invisible to type system)
- Kanban keyboard accessibility
- Color-only health-dot signal (accessibility)
- Multi-region backup replication
- Frontend unit tests with React Testing Library
- OpenTelemetry distributed tracing (Sentry gives errors; tracing gives latency visibility)
- IdP migration (Supabase Auth → Okta/Entra SSO) when Manipal IT is ready

---

**Summary:** 7 tasks for the Replit agent (~1 week), 7 human gates running in parallel. Close all 14 and Ringside is genuinely production-ready for a controlled pilot. The biggest single risk is H3 (OpenAI DPA) — until that's signed, ship with the Copilot disabled and there is no M&A confidentiality exposure.
