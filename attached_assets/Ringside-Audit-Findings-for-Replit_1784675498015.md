# Ringside — Comprehensive Engineering Audit Findings

**Prepared for:** Replit Support / Replit Engineering
**Prepared by:** Rahul Sharma, Corporate Development & Strategy, Manipal Group
**Date:** 2026-07-21
**Repository:** `RahulSharma-Codes/Ringside` @ commit `c7b3a16` ("Published your App")
**Deployment:** Replit Autoscale, Replit Postgres, Replit Object Storage
**Stack:** pnpm workspace monorepo · Node.js 24 · React 19 + Vite · Express 5 · Drizzle ORM · PostgreSQL 16

---

## 0. Purpose of this document

Ringside is an M&A deal-intelligence platform holding **material non-public deal information** (pipeline stages, valuations, diligence workstreams, IC memos, counterparty financials, NDAs, regulatory clearances). It is being prepared for production rollout to the Manipal Group Corporate Development team.

Two independent agent-assisted audits were run against the live repository on 2026-07-21. Their findings were reconciled and verified against source. This document consolidates everything Replit needs to see in order to (a) answer questions only Replit can answer, and (b) advise on the right way to harden the deployment on Replit's infrastructure.

**Asks of Replit are in §6.** Everything else is context.

---

## 1. Executive summary

**Verdict:** 🔴 **NOT production-ready.** Path to GO in ~2 engineering weeks contingent on Replit answers in §6.

| Severity | Count | Status |
|---|---|---|
| 🔴 Critical | **6** | All verified against source |
| 🟠 High | **13** | All verified against source |
| 🟡 Medium | 16 | Verified by spot-check |
| 🟢 Low | 6 | — |
| **Total** | **41** | |

**The six criticals, in priority order:**

1. **Hardcoded production admin credentials committed to the public repo** and auto-seeded on every server start (`Ringside@123` / `rahul.sharma@manipalgroup.info`).
2. **JWT signing secret falls back to a public hardcoded string** (`"dev-secret-change-me"`) if `SESSION_SECRET` env var is unset — total auth bypass on misconfiguration.
3. **One-time login codes (OTP) returned in API response body** whenever SMTP env vars are missing — gated on email config, not on a production flag.
4. **Three core database tables (`targets`, `interactions`, `stage_change_log`) have no creation step in the startup migration script.** A fresh deploy onto a blank database would fail to boot.
5. **The `.replit [postMerge]` hook is silently broken or potentially destructive** — runs `drizzle-kit push --force` against the live DB on every Replit-side `git pull`, with no alerting on failure and a 2-minute timeout.
6. **No database backup or point-in-time recovery of any kind exists.** A data-loss event on the Replit Postgres instance is unrecoverable.

---

## 2. Methodology

Both audits were run **read-only** against the repository. No code was changed. Findings were verified by actual execution:

| Check | Tool | Result |
|---|---|---|
| Clean install | `pnpm install --frozen-lockfile` | ✅ 774 packages |
| Type checking | `pnpm run typecheck` | ✅ All 4 workspace projects clean |
| Production build | `pnpm run build` (api-server + growth-os) | ✅ Succeeds with env vars set |
| Dependency audit | `pnpm audit --prod` | ❌ 7 unique GHSA advisories |
| Secret scan | `git grep` + git history scan | ❌ Hardcoded creds in 4 files |
| RLS coverage audit | Source review of `CORE_TABLES` array | ❌ 1 table missing |
| Schema boot audit | Source review of all `CREATE TABLE` statements | ❌ 3 tables missing |

Every file:line reference in §3–§5 was opened and the claim verified against the actual code.

---

## 3. Critical findings (6)

### CRIT-1 · Hardcoded production admin credentials in repo, auto-seeded on every boot 🔴

**Files (4):**
- `artifacts/api-server/src/index.ts:448` — runs on every container start
- `tests/global-setup.ts:18-19` — test auth
- `tests/e2e/lazy-chunks.spec.ts` — repeated in plain text
- `artifacts/growth-os/AUDIT_REPORT.md` — repeated in plain text

**Evidence:**
```ts
// artifacts/api-server/src/index.ts:448
const defaultPasswordHash = await bcrypt.hash("Ringside@123", 10);
// ...
INSERT INTO users (company_id, email, display_name, role, password_hash)
SELECT '00000000-0000-0000-0000-000000000001',
       'rahul.sharma@manipalgroup.info', 'Admin', 'Admin', ${defaultPasswordHash}
```

**Impact:** Anyone who reads the public GitHub repository has the production admin email and password. The seed is **idempotent and unguarded by `NODE_ENV`** — it runs on every startup, including production deployments. The first person to hit the login screen with the public credentials is Admin.

**Fix:** Remove the seed; replace with a one-time CLI bootstrap (`pnpm admin:create`) that prompts for password. Scrub the credentials from git history via BFG or `git filter-repo`. Rotate the password everywhere.

---

### CRIT-2 · JWT signing secret falls back to a public hardcoded string 🔴

**Files:**
- `artifacts/api-server/src/middlewares/auth.ts:6`
- `artifacts/api-server/src/routes/auth.ts:13`
- `scripts/src/test-rls-isolation.ts:56`

**Evidence:**
```ts
const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
```

**Impact:** If `SESSION_SECRET` is unset in the production environment, every JWT is signed with a publicly known constant. Anyone can forge a valid admin token using only information already in the public repo. The in-repo `SECURITY_AUDIT.md` (line 319) calls this fallback "acceptable (env-var takes precedence in production)" — **for a system holding material non-public deal data, it is not acceptable.** A single misconfigured prod deploy = total authentication bypass with no alarm.

**Fix:** Fail-fast in production if `SESSION_SECRET` is unset or shorter than 32 characters. Warn-only in dev.

---

### CRIT-3 · OTP login codes returned in API response body when SMTP is unconfigured 🔴

**File:** `artifacts/api-server/src/routes/auth.ts:222-223`

**Evidence:**
```ts
// SMTP not configured at all — return code in response for dev/internal use
return res.json({ ok: true, code, message: "SMTP not configured. Code shown for development use only." });
```

**Impact:** The OTP login flow returns the one-time code in the response body whenever `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` env vars are absent. The in-repo `SECURITY_AUDIT.md` (line 320) calls this "✅ Secure" on the basis that "SMTP entirely unconfigured" = "dev mode." **This conflation is wrong.** A production deployment that loses SMTP configuration for any reason — config drift, failed secret rotation, container rebuild without secrets, Replit Secrets scope change — will hand working one-time login codes to anyone able to inspect network traffic.

**Fix:** Gate the in-response code path on `process.env.NODE_ENV !== "production"` explicitly. Never on SMTP config presence.

---

### CRIT-4 · Three core tables missing from startup-migration CREATE statements 🔴

**File:** `artifacts/api-server/src/index.ts` — full scan of 23 `CREATE TABLE IF NOT EXISTS` statements

**Evidence:**
```
Tables with CREATE TABLE IF NOT EXISTS in startup: 23
Tables referenced via FK in those CREATE statements but NEVER created themselves:
  - targets            ← the central deals table
  - interactions       ← deal interaction log
  - stage_change_log   ← pipeline-stage audit trail
```

**Impact:** A fresh deploy onto a blank database (new environment, disaster-recovery restore, migration off Replit, autoscale spin-up onto a rebuilt Postgres instance) will fail to boot — every other table's `REFERENCES targets(id)` FK will fail with `relation "targets" does not exist`. Current production works only because those three tables were created manually outside the script at some earlier point. The boot sequence is not self-sufficient.

**Fix:** Add `CREATE TABLE IF NOT EXISTS` statements for the three missing tables, matching their Drizzle schema definitions in `lib/db/src/schema/targets.ts`. Test by booting against a genuinely empty database.

---

### CRIT-5 · `.replit [postMerge]` hook is silently broken or potentially destructive 🔴

**Files:**
- `.replit` → `[postMerge] path = "scripts/post-merge.sh" timeoutMs = 120000`
- `scripts/post-merge.sh`
- `lib/db/package.json:12` → `"push-force": "drizzle-kit push --force --config ./drizzle.config.ts"`

**Evidence:**
```bash
#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push-force   # drizzle-kit push --force
```

`drizzle.config.ts` resolves the database URL from `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` — the same env vars as runtime — so the command does target the live Replit Postgres instance.

**Impact (two distinct failure modes, both bad):**

1. **Silent failure.** `set -e` aborts on any error, the hook has a 2-minute timeout, and there is no success/failure reporting back to Replit. If `drizzle-kit push` fails (lock contention, statement timeout, schema conflict), the merge succeeds but the schema is left in an inconsistent state with no warning to the developer.
2. **Destructive drift reconciliation.** The startup script in `index.ts` performs many `ALTER TABLE ADD COLUMN` operations outside the Drizzle schema (e.g., `cp_cin`, `cp_founders`, `cp_key_management`, `cp_controlling_shareholders`, `cp_website`, `cp_notes` on `targets`). `drizzle-kit push --force` may attempt to reconcile this drift by dropping the unmanaged columns — silently deleting production data.

The `replit.md` project notes document that the team previously abandoned `drizzle-kit push` in favor of idempotent startup migrations because the Supabase pooler "became unreachable." This strongly suggests the post-merge hook is the leftover from that earlier approach and no longer matches the actual migration strategy.

**Fix:** Delete the post-merge hook. Replace with: (a) explicit Drizzle migration files (`drizzle-kit generate`) committed to the repo, (b) a CI step that runs `drizzle-kit migrate` against staging, (c) a deliberate, logged migrate-on-release step for production. None of these should be triggered automatically by a `git pull`.

---

### CRIT-6 · No database backup or point-in-time recovery of any kind 🔴

**Evidence:** Exhaustive search of the repository, `.replit`, `scripts/`, `docs/`, and Replit configuration — no backup strategy, no `pg_dump` schedule, no documented PITR, no export job.

**Impact:** This is the single highest-impact gap in the entire audit. If the Replit Postgres instance is corrupted, accidentally dropped, or experiences data loss on Replit's end, **all deal history is permanently and completely unrecoverable** — pipeline stages, diligence records, IC notes, valuations, counterparty information, NDA register, regulatory clearance map. There is no way to even partially reconstruct it.

The Manipal Group's original build specification for this system explicitly called point-in-time recovery "non-negotiable for a Group-of-record system." It was never built.

**Questions for Replit (see §6):** Does the current Replit Postgres tier include automated backups and/or PITR? If not, what is the recommended path? Is the existing Replit Object Storage bucket (configured in `.replit [objectStorage] defaultBucketID`) suitable as a `pg_dump` destination?

---

## 4. High-severity findings (13)

| # | Finding | File:line | Fix |
|---|---|---|---|
| HIGH-1 | CORS fails open when `REPLIT_DOMAINS` env var is missing — defaults to allow-any-origin + credentials | `artifacts/api-server/src/app.ts:38-73` | Default to deny-all in production; log loudly when env var is missing |
| HIGH-2 | Deal-reorder transaction opens its own DB connection, bypassing the per-request RLS context | `artifacts/api-server/src/routes/targets.ts:122` | Re-apply company-isolation check explicitly inside any transaction that opens its own client |
| HIGH-3 | `stage_change_log` table missing from `CORE_TABLES` array in startup script — not protected by RLS policies | `artifacts/api-server/src/index.ts:551` | Add to `CORE_TABLES`; verify `ai_phase_runs` while at it |
| HIGH-4 | Target creation is 5 separate non-transactional writes (deal, milestone, stage_log, audit_event, target_access) — partial failure leaves orphan records | `artifacts/api-server/src/routes/targets.ts:136-198` | Wrap in single `db.transaction()` |
| HIGH-5 | `/api/targets` list endpoint has no pagination or row cap — returns all matching rows | `artifacts/api-server/src/routes/targets.ts:41-97` | Add `.limit()` + pagination, matching pattern already used elsewhere |
| HIGH-6 | All 7 AI-backed endpoints return HTTP 200 even on outright failure (dead API key, lapsed billing, provider unreachable) — monitoring cannot distinguish outage from empty result | `artifacts/api-server/src/routes/ai.ts` (18 call sites) | Return distinct 5xx for genuine provider/system failures |
| HIGH-7 | No error monitoring, alerting, or log aggregation (no Sentry, Datadog, New Relic, uptime monitor) | repo-wide | Wire up free-tier error tracker for API server; ship pino logs to a sink |
| HIGH-8 | Server accepts live traffic before startup migrations complete; `/healthz` returns `{status:"ok"}` without checking DB | `index.ts:687-697`, `routes/health.ts:6` | Block traffic until migrate completes; add `/readyz` that pings DB |
| HIGH-9 | Failed DB migration logs one warning and continues serving traffic against stale schema — has happened once before | `index.ts:21-44` | Pipe migration failure to monitoring; consider failing the deploy |
| HIGH-10 | `company_id` column exists in DB for 19 of 21 core tables but is not declared in Drizzle schema — type system blind to it | `lib/db/src/schema/*` | Add to schema definitions |
| HIGH-11 | Frontend: Kanban drag-drop updates local view optimistically but doesn't invalidate shared query cache — card appears to snap back | `pipeline-kanban.tsx:778-828` | Route through shared cache; wire refresh callback |
| HIGH-12 | Frontend: marking an action complete in Command Center doesn't refresh per-deal Actions tab (and vice versa) | `actions.tsx:320-349` vs `target-detail-actions.tsx` | Invalidate same query key on both views |
| HIGH-13 | Frontend: dashboard renders "0" identically for empty data and failed-to-load data — silent outage looks like empty pipeline | `dashboard.tsx` | Check error state per metric; show "couldn't load" distinctly |

---

## 5. Medium and low findings (22)

**Medium (16):** No AI-endpoint rate limit · Notification-generation endpoint has no role restriction · Audit-chain tamper-detection can false-positive (uses wrong "previous entry" lookup) · Stale Supabase fallback credentials still in DB URL resolver · Missing indexes on `actions.target_id` and `milestones.target_id` · Drizzle schema and raw SQL DDL disagree on cascade rules · Three "proposed-migration" SQL files in `docs/proposed-migrations/` are already applied but not marked · Almost every add/edit dialog lacks client-side validation · Kanban is mouse-only, no keyboard alternative · Health-dot uses color alone on the two highest-traffic screens · 1.1 MB JavaScript bundle (`target-detail.js`, 308 KB gzip) — needs further code-splitting · Single-vendor hosting with no contingency · Stale QA report references removed features · No documented env var manifest · Bundle includes jspdf and html2canvas eagerly loaded.

**Low (6):** `default-company` lookup has no explicit ordering · `.gitignore` doesn't exclude `.env*` files · No DB-level CHECK constraints on score/financial fields · Notification bell dropdown not keyboard-accessible · One file grown to 1,679 lines (`target-detail-ic.tsx`) · No `LICENSE`, `SECURITY.md`, or `CONTRIBUTING.md`.

---

## 6. Questions for Replit

These are the items only Replit can answer. They directly determine remediation scope for CRIT-4, CRIT-5, and CRIT-6.

### 6.1 Replit Postgres backup & recovery (blocks CRIT-6 fix)
1. Does the current Replit Postgres tier (the one provisioned via `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` env vars in an Autoscale deployment) include **automated daily backups**?
2. Is **point-in-time recovery (PITR)** available? If yes, what is the retention window?
3. If neither is available as a managed feature, what is Replit's recommended pattern for application-level backup of a Postgres instance provisioned this way?
4. Are backups restorable by the customer, or only by Replit support on request? What is the RTO?

### 6.2 Post-merge hook behaviour (blocks CRIT-5 fix)
5. When `[postMerge]` in `.replit` runs a script that exits non-zero (or times out at `timeoutMs`), what is the user-visible behaviour in the Replit editor? Is the failure surfaced anywhere — the editor, an email, a webhook?
6. Is there any Replit-native mechanism for running schema migrations on release that we should be using instead of a custom `[postMerge]` hook?

### 6.3 Replit Object Storage (relevant to CRIT-6 fix)
7. The `[objectStorage] defaultBucketID` in `.replit` is `replit-objstore-f05d61ab-70fb-4551-9e66-e650ed065710`. Is this bucket suitable as a destination for nightly `pg_dump` artifacts (write-once, lifecycle policy, etc.)?
8. Is there a Replit-native way to ship structured logs (pino line-delimited JSON) from an Autoscale deployment to an external sink (Splunk, Datadog, CloudWatch, BigQuery)?

### 6.4 Replit Secrets management (relevant to CRIT-1/2/3 fixes)
9. Once an env var is set via Replit Secrets, is it bound to the deployment environment only, or also visible to forks/clones of the project? (Asking specifically because the audit found hardcoded secrets in source — we need to confirm the cutover to env-var-only won't regress.)
10. Is there a Replit-native way to rotate a secret and have it take effect on the next autoscale spin-up without code changes?

### 6.5 Deployment & availability (relevant to HIGH-8/9)
11. When an Autoscale deployment starts a new instance, does Replit wait for the instance to respond `200` on the configured health port before routing traffic to it, or does traffic route immediately on process start?
12. Is there a way to gate "ready to serve traffic" on a custom check (e.g., DB readiness) other than the application refusing connections?

---

## 7. Remediation roadmap

### Sprint 1 — Criticals + quick wins (~7 dev-days)
- Fix CRIT-1 → CRIT-6 in priority order
- Add `.env.example` and `docs/configuration.md` covering all 20 env vars
- Apply pnpm overrides for the 7 dependency CVEs
- Delete the legacy Python prototype and `.zip` patch from repo root
- Delete the dead `lib/supabase-storage.ts` module
- Add `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`
- **Awaiting Replit answers in §6** before CRIT-5 and CRIT-6 can be closed

### Sprint 2 — Deployment surface (~5 dev-days)
- Stand up GitHub Actions CI: typecheck + build + audit + test + CodeQL + gitleaks
- Write Dockerfile (multi-stage, non-root) for portability off Replit if needed
- Commit missing 18 Playwright E2E specs; add Vitest setup
- Wire Sentry (or equivalent) for API error monitoring
- Add `/readyz` with DB + GCS dependency checks
- Move boot-time DDL into explicit Drizzle migration files

### Pre-production gate
- External penetration test by a CERT-In empanelled auditor
- Load test (k6): target 500 concurrent users, p95 < 500ms
- Restore drill on whatever backup mechanism Replit confirms in §6.1
- Data Processing Agreement with OpenAI executed (AI Copilot sends deal data to OpenAI — DPDP and M&A confidentiality angle)

---

## 8. What is already strong

For balance — Ringside does several things above average for an internal tool, and these were specifically verified clean:

- **Per-company data isolation design** — PostgreSQL Row-Level Security with `app.company_id` GUC + `app_rls` non-superuser role switching per request. Correct architecture, modulo the `stage_change_log` gap (HIGH-3) and the transaction-bypass gap (HIGH-2).
- **Supply-chain hygiene** — `minimumReleaseAge: 1440` (1-day minimum publish age for npm packages) plus explicit version overrides for known-vulnerable transitive packages (`picomatch`, `ws`). Genuine, low-maintenance defense against npm-takeover attacks.
- **Per-user access controls (Phase 10A)** — non-admin users see no deals until explicitly granted access; admin role gating on management routes; IDOR denials return 404 (not 403) per OWASP guidance.
- **Password handling** — bcrypt hashing, 5-failure → 15-min lockout, OTP 3-failure → 15-min lockout, JWT blocklist on logout.
- **File upload safety** — MIME whitelist, 25 MB size cap, multer error → correct HTTP code mapping.
- **AI Copilot access scoping** — verified the AI assistant cannot be used to access data outside the requesting user's permissions.
- **Import-wizard business rules** — blank-field-skip and deal-code immutability rules are enforced in code, not just documented.
- **API/database/documentation consistency** — spot checks across OpenAPI spec, Drizzle schema, and route code showed clean agreement.
- **TypeScript discipline** — strict typecheck clean across all 4 workspace projects.

---

## 9. Repository state at time of audit

- Commit: `c7b3a16` ("Published your App")
- Branch: `main`
- Last 5 commits:
  ```
  c7b3a16 Published your App
  d2a0f02 Stop notification polling when a query errors
  c91e323 Improve application performance and navigation experience
  19d4069 Improve user guide readability and visual polish
  44b801a Published your App
  ```
- Monorepo layout: `artifacts/{api-server,growth-os,mockup-sandbox}`, `lib/{api-client-react,api-spec,api-zod,db}`, `scripts`, `tests`

---

## 10. Appendix — verification log

Every claim above was verified by direct source inspection. Commands run (in `/tmp/opencode/Ringside` after `pnpm install --frozen-lockfile`):

```bash
# CRIT-1 hardcoded admin creds
git ls-files | xargs grep -lE "(Ringside@123|rahul\.sharma@manipalgroup\.info)"
# → artifacts/api-server/src/index.ts, tests/global-setup.ts, tests/e2e/lazy-chunks.spec.ts, artifacts/growth-os/AUDIT_REPORT.md

# CRIT-2 JWT fallback
git grep -nE "SESSION_SECRET.*dev-secret-change-me"
# → middlewares/auth.ts:6, routes/auth.ts:13, scripts/src/test-rls-isolation.ts:56

# CRIT-3 OTP in response
sed -n '200,260p' artifacts/api-server/src/routes/auth.ts
# → confirms `return res.json({ ok: true, code, ... })` at end of OTP request handler

# CRIT-4 missing CREATE TABLE
grep -nE "CREATE TABLE IF NOT EXISTS" artifacts/api-server/src/index.ts | wc -l   # = 23
grep -nE "CREATE TABLE IF NOT EXISTS (targets|interactions|stage_change_log)\b" artifacts/api-server/src/index.ts   # = 0

# CRIT-5 post-merge hook
cat scripts/post-merge.sh
# → pnpm install + pnpm --filter @workspace/db run push-force
grep "push-force" lib/db/package.json   # → "drizzle-kit push --force --config ./drizzle.config.ts"
cat lib/db/drizzle.config.ts   # uses PGHOST — points at live DB

# HIGH-1 CORS fail-open
sed -n '38,73p' artifacts/api-server/src/app.ts

# HIGH-3 stage_change_log RLS
sed -n '/CORE_TABLES\s*=/,/^]/p' artifacts/api-server/src/index.ts
# → 21 tables listed, stage_change_log absent

# HIGH-4 non-transactional create
sed -n '136,200p' artifacts/api-server/src/routes/targets.ts   # 5 separate awaits, no db.transaction()

# HIGH-5 no pagination
sed -n '41,97p' artifacts/api-server/src/routes/targets.ts   # no .limit()

# HIGH-6 AI 200 on failure
grep -nE "return res\.json" artifacts/api-server/src/routes/ai.ts | head -20

# Dependency audit
pnpm audit --prod | grep -oE "GHSA-[a-z0-9-]+" | sort -u | wc -l   # = 7 unique advisories
```

---

**Contact:** Rahul Sharma, rahul.sharma@manipalgroup.info
**Awaiting Replit response on §6** before Sprint 1 criticals CRIT-4, CRIT-5, and CRIT-6 can be closed.
