# TMG · Group M&A Pipeline Tracker
## Build Specification · v2.0 · May 2026 · Confidential

| | |
|---|---|
| **Prepared by** | Surya Sudheer, Principal — CDS |
| **Supersedes** | TMG CDS Deal Intake Engine Amendments v1.1 (May 2026) and v1.0 (May 2026) |
| **Classification** | Internal — Restricted |
| **Status** | Pre-build — awaiting Group sign-off |
| **Audience** | Group leadership, IC members, CDS team, build/IT, external implementation partner |

This document is the canonical specification for the TMG **Group M&A Pipeline Tracker** — the Group-level "Bible" for tracking inbound and outbound strategic transactions across all TMG entities. It supersedes the CDS-only v1.1 specification in its entirety. v1.1 is retained as a migration appendix because the CDS team continues to operate v1.1 as a tactical tool until v2.0 cuts over.

The document is organised so a corporate finance reader can find domain content in **Parts I–IV**, an engineer can find architecture and build content in **Part V**, and a programme owner can find sequencing and migration content in **Parts VI–VIII**.

---

# Update Notes — what changed vs v1.1 and why

The CDS team's v1.1 specification was a tactical prototype for a 5-person team operating one inbound deal flow inside one TMG entity. The Group brief is fundamentally larger: multiple companies, multiple deal types, multiple personas, multiple advisors, multiple decision forums, with regulated confidentiality and IC-grade audit. v2.0 is therefore a rewrite. The table below enumerates every material change and the reason for it. Every v1.1 feature that was correct (source-verification partial flag, teaser-size UX, sub-admin scoping, learning loop, etc.) is **carried forward and extended** under v2.0 primitives — not dropped.

| # | Area | v1.1 (what it was) | v2.0 (what it is) | Why the change |
|---|---|---|---|---|
| 1 | **Scope** | CDS-only tool, single team, single TMG entity | **Group-level platform** with per-company tenancy and Group Admin overlay | "Bible at Group level" requirement; v1.1 architecturally cannot host multiple entities |
| 2 | **Deal types** | Inbound deal triage only | **Six deal classes** — Acquisition, Minority Investment, JV, Partnership, Divestiture, Strategic Alliance — with stage-variant flags and field requirements | TMG actually does all six; the Bible must cover them |
| 3 | **Lifecycle** | 10-stage Kanban referenced but not defined | **12 canonical stages** with explicit gate criteria, deal-type variants, mandatory inputs/outputs per stage | M&A practice requires distinct gates at NDA, IOI, LOI, IC, Definitive, Signing, Closing |
| 4 | **Due diligence** | Phase 2 paste-back of MCA/eCourts/Tofler/LinkedIn/Glassdoor | **Multi-workstream DD module** — 9 workstreams (Financial, Legal, Tax, Commercial, Ops, HR, IT/Cyber, ESG, Regulatory) with owner, status, redflag tracker, evidence links, IC-gate approval | Real DD is a coordination problem v1.1 did not model |
| 5 | **Investment Committee** | Not modelled | **Dedicated IC workflow** — proposal pack, voting matrix, conditions precedent, post-IC tracker, escalation thresholds by deal size/sector/geography | IC is the highest-stakes decision point; must be first-class |
| 6 | **Valuation & economics** | Not modelled | **Valuation framework** (DCF, trading comps, transaction comps, LBO/returns), sensitivity bands, valuation evolution log; **synergies register** with realisation curve; consideration structure (cash/stock/earn-out/CVRs); Sources & Uses; accretion/dilution | The system cannot be the Bible without this |
| 7 | **Documents & data room** | base64 in browser storage, 4MB ceiling, reference-only fallback over 5MB | **Object store with KMS envelope encryption**, document versioning, NDA register, **VDR linkage** (Intralinks/Datasite/Drooms), redaction state, watermarking | Group-scale document handling is incompatible with browser storage |
| 8 | **Identity / authentication** | Email OTP only (introduced in v1.1 to replace v1.0 PIN) | **OIDC SSO** (Azure AD/Entra ID) primary + **email OTP fallback** (for external advisors and SSO-edge cases) + **MFA enforced** for IC and Admin tiers | Group-scale integration; external-advisor access required without provisioning Group SSO |
| 9 | **Authorisation** | 4-tier RBAC (Admin / Principal / EM / SA) with sub-admin scope | **RBAC + ABAC overlay** — 8 base roles plus deal-level ACL (deal team, conflicts wall, restricted-list); **Postgres Row-Level Security** for tenant isolation | Multi-tenancy + M&A confidentiality requirements (conflicts wall, restricted-list) |
| 10 | **Audit log** | 12 event types in shared browser storage | **Append-only event store** with ~25 event types; **hash-chain tamper-evidence** for IC and legal events; immutable at API layer | Tamper-evidence required for regulated transactions and IC defensibility |
| 11 | **AI analysis engine** | Phase 1 (screen) + Phase 2 (intelligence) | **Five-phase pipeline** — Phase 1 (screen), Phase 2 (intelligence), **Phase 3 (IC memo draft)**, **Phase 4 (valuation sanity-check)**, **Phase 5 (DD synthesis & redflag rollup)**; LLM-agnostic via internal proxy; prompt registry; eval harness | M&A workflow needs analytical leverage at IC and DD stages, not just at intake |
| 12 | **Pipeline analytics** | Not present | **Funnel conversion** by stage and deal-type; **time-in-stage**; **win/loss with reason codes**; **valuation discipline** (entry vs exit multiples); **sector concentration**; **hit-rate by sourcing channel**; **origination productivity** per banker | "Strong analyse functionalities" requirement; analytics is the second-highest-leverage feature after IC workflow |
| 13 | **Reporting layer** | Not present | **Auto-generated reports** — Weekly Pipeline Review, Monthly IC Pack, Quarterly Board Pack, Ad-hoc Deal Memo; ad-hoc query builder for Group Admin; export to PPTX/PDF/XLSX | Bible-grade MIS — recurring forums need self-serve packs |
| 14 | **Architecture** | Single HTML + thin Node/Python proxy + shared browser storage + Anthropic API key on proxy | **Multi-tenant SaaS** — Postgres 16 with RLS, FastAPI (or NestJS) modular monolith, Next.js 15 SPA, OpenSearch, S3-compatible object store with KMS, Redis, OpenTelemetry, CI/CD | Cannot meet Group requirement otherwise |
| 15 | **Code quality & ops** | Not specified | **Typed everywhere** (TypeScript / Python `strict`); pre-commit (ruff/black/eslint/prettier); test pyramid (unit + contract + integration + e2e) with **≥80% coverage on domain layer**; SAST/DAST/SCA scanning; OpenTelemetry; SLOs (p95 API < 300ms, AI Phase 1 < 60s); trunk-based with required PR review + CODEOWNERS; PITR backups, RPO 15min / RTO 4h | "Code quality and build perspective" requirement; non-negotiable for a Group-of-record system |
| 16 | **Confidentiality controls** | None beyond role tier | **Conflicts wall** (deal-level firewall between competing assignments), **restricted-list** (named-deal access only), **document classification** (Public / Internal / Restricted / Highly Restricted) with watermarking and copy-prevention on Restricted+ | M&A teams routinely run conflicting assignments; the system must enforce Chinese-wall discipline |
| 17 | **Notifications** | None | Stage-stagnation, expiring NDAs, IC voting deadlines, valuation drift, redflag escalations, milestone slippage; channel routing (email, Slack/Teams, WhatsApp) configurable per tier | Bible-grade workflow needs proactive nudging |
| 18 | **Migration** | N/A | **Explicit v1.1 → v2.0 migration plan** — CDS becomes the first tenant; one-shot export/import; 6-week parallel run; cutover criteria | Protects v1.1 momentum; CDS gets v2.0 benefits without losing data |
| 19 | **Carried forward unchanged in spirit** | Source-verification partial flag, teaser-size UX, sub-admin scoping, closed-deal verdict tagging, learning loop sector calibration | Retained — re-expressed under v2.0 primitives (DD module, document store, ABAC, learning-loop dashboard) | These were correct in v1.1 and should not be lost |

A full traceability matrix from v1.1 sections to v2.0 sections is provided in **Appendix G**.

---

# Part I — Vision, Scope & Personas

## §1. Executive Summary

The Group M&A Pipeline Tracker is the single source of truth for every strategic transaction TMG evaluates, executes, or exits — across all Group entities, all deal types, and the full lifecycle from sourcing to post-close integration. Its three commitments to the Group are:

1. **One pipeline, one truth.** Every deal — inbound or outbound, M&A or partnership, CDS-led or business-unit-led — sits in one system with one taxonomy and one lifecycle, viewable at deal, team, company, or Group level.
2. **Decision quality at IC.** Every deal that reaches IC carries a structured proposal pack, a verifiable diligence trail, an auditable valuation history, and a defensible synergy view — generated as a by-product of the workflow, not assembled at the last minute.
3. **Compounding intelligence.** Every closed deal — Realised or Dropped — feeds back into the doctrine. The system gets sharper at sector screening, valuation discipline, and redflag detection over time, instead of replaying the same mistakes deal after deal.

The platform is deployable on internal infrastructure (the Group's Azure / on-prem footprint) and is **independent** of any single AI vendor or third-party SaaS for its core function. It integrates outward (SSO, VDR, CRM, finance) but does not depend on any one of those integrations to operate.

## §2. Problem Statement & Why v2.0

v1.1 was a strong tactical prototype for the CDS team. It is not, and was never intended to be, the Group's deal-of-record system. The architectural facts of v1.1 — single HTML, browser-storage state, ~80–100 LOC proxy — make it unsuitable for:

- Multiple TMG entities each running their own deal flow with their own teams
- Persona breadth (IC voters, external advisors, legal/compliance, business sponsors)
- Document scale (real M&A deal stacks are GBs across hundreds of files, not <5MB teasers)
- Concurrent users across geographies and time zones at Group scale
- Tamper-evident audit for regulated transactions (CCI, RBI, SEBI, FEMA, DPDP)
- Pipeline analytics, MIS reporting, and decision-quality measurement
- Conflicts management (Chinese-wall) across competing assignments

v2.0 rebuilds on a multi-tenant SaaS foundation that supports all of the above without ceremony, while inheriting every domain insight v1.1 captured.

## §3. Personas

| # | Persona | Tier | Primary use case | Access shape |
|---|---|---|---|---|
| 1 | **Group Admin** | Group | Owns the platform; sees across all tenants; manages roster, KMS keys, IdP config, deal-share grants, learning-loop dashboard | Full read across tenants; write only on shared config |
| 2 | **Company Admin** | Company | Manages a TMG entity's tenant; configures team, sub-admin scopes, approval thresholds, IC composition for that entity | Full read/write within own tenant |
| 3 | **MD / Principal / Deal Lead** | Tenant | Owns deals end-to-end; runs Phase 1–5 analyses; chairs IC sub-meetings; reassigns | Read/write on owned deals + sub-admin-scoped deals |
| 4 | **Engagement Manager / VP / Workstream Lead** | Tenant | Drives execution on assigned deals; coordinates DD workstream owners; drafts IC pack | Read/write on assigned deals |
| 5 | **Associate / Senior Associate** | Tenant | Executes Phase 1 screening and DD paste-back; maintains deal records; supports IC pack | Read/write on own deals only |
| 6 | **IC Member (Voting)** | Cross-tenant | Reviews IC proposals; votes; sets conditions precedent | Read on IC-routed deals; write only on IC actions |
| 7 | **Legal / Compliance** | Cross-tenant | Reviews NDA register, conflicts checks, regulatory routing, restricted-list, document redaction | Read on flagged deals; write on legal/compliance actions |
| 8 | **External Advisor** (banker / lawyer / consultant) | Tenant-guest | Limited access to specific deal(s) for collaboration; OTP-authenticated | Read/write only on the specific deal(s) granted |
| 9 | **Observer / Read-only** (board observer, sponsor exec) | Configurable | Reviews dashboards and reports; no transaction actions | Read-only at configured scope |

Each persona has a *day-in-the-life* mapping to features documented in the **Persona Walk-throughs** verification asset (cross-referenced from §43 below).

## §4. Deal-Type Taxonomy

Six deal classes. Each class shares the canonical lifecycle (§7) but differs on (a) which stages are mandatory vs skipped, (b) which definitive document is signed, and (c) which fields are required.

| Class | Canonical example | Stage variants | Definitive doc | Distinguishing required fields |
|---|---|---|---|---|
| **Acquisition** | TMG entity acquires majority/100% of target | Full lifecycle, all 12 stages | Share Purchase Agreement (SPA) | Consideration mix, control %, escrow %, MAC clauses |
| **Minority Investment** | TMG takes minority stake with rights | Skip post-close integration as control transition; emphasise rights package | Share Subscription Agreement + Shareholders' Agreement (SSA + SHA) | % stake, rights (board, info, anti-dilution, ROFR/ROFO, tag/drag), liquidation preference |
| **Joint Venture** | TMG + counterparty form NewCo | Add JV-formation stages (NewCo incorporation, capitalisation, IP transfer); IC at term sheet, Definitive, and post-formation | JV Agreement + SHA | JV ownership %, capital commitment schedule, governance, IP contributions, exit mechanics |
| **Partnership** | Commercial / strategic agreement, no equity | Lighter weight: Sourced → IOI → Term sheet → Definitive → Signing → Realised; skip DD-heavy stages | Master Services Agreement / Strategic Partnership Agreement | Term, exclusivity, KPIs, revenue share, termination |
| **Divestiture** | TMG entity divests subsidiary / business / asset | Mirror of Acquisition from sell-side; emphasise vendor DD, perimeter, separation | SPA / Asset Purchase Agreement | Perimeter, carve-out scope, TSA terms, indemnity caps |
| **Strategic Alliance** | Equity-light cooperation (e.g., go-to-market, R&D) | Lightweight: Sourced → IOI → Heads of Terms → Definitive → Realised | Alliance Agreement / Heads of Terms | Scope, IP ownership rules, governance forum, term |

Stage-variant matrix is fully enumerated in **Appendix A**.

## §5. In-Scope / Out-of-Scope for v2.0

**In scope.** Inbound and outbound deal pipeline; full deal lifecycle to post-close integration tracking; AI analysis (5 phases); IC workflow; DD workstreams; valuation and synergies; documents and VDR linkage; pipeline analytics; standard reporting; multi-tenant Group operations; SSO + OTP authentication; RBAC + ABAC; audit log; learning loop.

**Out of scope for v2.0** — explicitly:

| Out of scope | Why / future path |
|---|---|
| Proactive market intelligence monitoring (sector signals, watchlists, portfolio company alerts) | Distinct product workstream — different infra (continuous ingestion, alerting). v2.1 candidate. |
| Native mobile applications | Desktop-first. Responsive web only in v2.0. Mobile evaluated post-launch based on actual usage. |
| Native OCR for image-based teasers | SAs convert before upload. v2.x candidate once usage justifies. |
| Regional language teaser processing | English-only ingestion in v2.0. |
| Live MCA / eCourts / Tofler API integration | Dependent on registry API SLAs; v1.1 paste-back model retained as default with API integration optional in v2.x. |
| Conversational IC copilot ("ask the deal") | v2.x; depends on retrieval architecture maturity. |

---

# Part II — Domain Model (the M&A spine)

## §6. Tenancy & Hierarchy

The platform is **multi-tenant** with a four-level hierarchy:

```
Group (TMG)
└── Company (TMG entity / portfolio holding)
    └── Business Unit (sector-aligned or geography-aligned sub-team)
        └── Team (deal-execution pod)
            └── User (with role and ABAC attributes)
```

- **Tenant boundary** is the **Company** level. Postgres Row-Level Security is keyed on `company_id`.
- **Group Admin** is the only role that traverses tenants without an explicit grant.
- **Cross-tenant deal sharing** (e.g. CDS co-leads a deal with a portfolio company's BD team) is supported via explicit **deal-share grants** — the deal's `primary_company_id` is the originating tenant; co-tenants get a scoped read/write grant logged in audit.
- A user belongs to **exactly one Company** for primary identity, but may carry deal-share grants spanning others.

## §7. Canonical Deal Lifecycle

Every deal moves through a canonical stage machine. Type-variant skips are declared per deal class (§4 / Appendix A). Stage transitions are guarded — required inputs must be populated and the appropriate role must execute the transition; both the transition and the gate evaluation are written to the audit log.

| # | Stage | Purpose | Mandatory inputs to enter | Approver | Typical duration |
|---|---|---|---|---|---|
| 1 | **Sourced** | Deal logged with source, sponsor, sector, deal-type, entry mode (inbound/outbound) | Source, contact, deal-type, sector | Deal Lead | — |
| 2 | **NDA** | NDA executed with counterparty | NDA scan/link, expiry, scope | Deal Lead + Legal | 1–2w |
| 3 | **Indicative Interest (IOI)** | Non-binding indication exchanged | IOI letter, indicative valuation range, deal structure | Deal Lead | 1–2w |
| 4 | **Phase 1 Screen** | AI-assisted screen output reviewed and signed off | AI Phase 1 output, deal-team verdict | Deal Lead | 1–3d |
| 5 | **Mgmt Engagement** | Management meetings / site visits | Meeting log, MP / detailed IM | Deal Lead | 2–4w |
| 6 | **Phase 2 DD Diagnostic** | Initial DD diagnostic across workstreams; redflag triage | Source-verification minimums (per v1.1 carried forward); DD diagnostic note | Deal Lead | 2–3w |
| 7 | **LOI / Term Sheet** | Binding/non-binding LOI signed | Signed LOI, valuation point, key terms | Deal Lead + Company Admin | 2–4w |
| 8 | **Confirmatory DD** | Full workstream DD with formal reports | All 9 workstream outputs (or marked N/A with justification); redflag log; integration plan draft | Workstream Leads + Deal Lead | 4–8w |
| 9 | **IC Approval** | Investment Committee proposal, vote, approval with CPs | Phase 3 IC memo; valuation pack; synergy schedule; redflag rollup; recommended terms | IC (per voting matrix) | 1–2w |
| 10 | **Definitive Agreements** | SPA / SHA / JVA / etc. negotiated and signed | Final definitive doc, conditions precedent register | Legal + Deal Lead + Company Admin | 4–8w |
| 11 | **Signing** | Execution of definitives; CP tracker activated | Signed copies, CP tracker | Deal Lead + Legal | 1d |
| 12 | **Closing** | All CPs satisfied; consideration paid; control / rights transferred | CP-complete confirmation; payment confirmation; share certificates / equivalent | Deal Lead + Finance + Legal | 1d–8w |
| 13 | **Post-close / Integration** | Integration plan executed; synergy realisation tracked | Integration milestones; synergy realisation log | Integration Lead | 12–24m |
| 14a | **Closed — Realised** | Deal completed and realised (or fully integrated) | Verdict tag + reason; learning-loop entry | Deal Lead + Group Admin | — |
| 14b | **Closed — Dropped** | Deal abandoned at any prior stage | Drop reason code + verdict tag | Deal Lead | — |

Stage stagnation, slippage, and reversal (re-engagement of a Dropped deal) are all first-class — same machinery as v1.1 §3.4 carried forward.

## §8. Deal Entity Data Model

The canonical `deal` entity carries fields that apply to every deal class. Type-specific extensions live in subordinate tables joined by `deal_id`. A precise schema sketch is in §31; this section is the domain view.

**Canonical fields (always present):**

- Identity: `deal_id` (UUID), `company_id`, `deal_code` (human-readable), `name`, `target_legal_name`, `target_cin_or_equivalent`, `entry_mode` (inbound/outbound), `source_channel`, `source_contact`
- Classification: `deal_type` (one of six), `sector`, `sub_sector`, `geography`, `currency`
- Lifecycle: `current_stage`, `stage_entered_at`, `stale_threshold_days`, `is_dormant`, `is_reversal`, `reversal_count`
- Team: `deal_lead_user_id`, `team_user_ids`, `workstream_leads` (map), `external_advisors` (list)
- Confidentiality: `confidentiality_tier` (Public / Internal / Restricted / Highly-Restricted), `acl_override` (deal-team-only flag), `restricted_list_flag`, `conflicts_wall_group_id`
- Status: `status_summary`, `last_action_by`, `last_action_at`

**Deal economics (versioned through the lifecycle):**

- `valuation` — series of `(version, stage, methodology, value_low, value_point, value_high, currency, recorded_at, recorded_by)` rows. Methodologies: DCF, Trading Comps, Transaction Comps, LBO, Asset, Other. Allows tracking how valuation shifted from IOI to LOI to Definitive.
- `consideration_structure` — cash %, stock %, earn-out %, deferred %, CVR %, escrow %, with absolute amounts; `total_enterprise_value`, `total_equity_value`
- `sources_and_uses` — capital sources (equity, debt, internal accruals, sponsor bridge) vs uses (purchase price, fees, refinancing, working capital injection)
- `capital_structure_post` — post-deal cap table snapshot or pointer

**Returns view** (for deals that go through IC):

- `irr_base`, `irr_upside`, `irr_downside`
- `moic_base`, `moic_upside`, `moic_downside`
- `payback_years`
- `accretion_dilution` — EPS / EBITDA accretion or dilution by year (acquisition class)
- Sensitivity table reference (§12)

**Type-specific extensions:**

- Acquisition / Divestiture: control %, MAC clauses, escrow terms, indemnity caps, R&W insurance flag, perimeter/carve-out spec
- Minority Investment: stake %, rights (board, info, anti-dilution, ROFR, ROFO, tag, drag), liquidation preference
- JV: ownership %, capital commitment schedule, governance forum, IP contributions, exit mechanics
- Partnership / Alliance: term, exclusivity, KPIs, revenue share, termination triggers

## §9. Counterparties, Sponsors & Advisors

Every deal has a **stakeholder graph**:

- **Counterparty** — the target (acquisition / minority / JV partner / divestiture buyer / partnership counterpart). Records: legal entity, CIN/equivalent, founders, key management, controlling shareholders.
- **Internal sponsors** — TMG-side champions; user IDs.
- **External advisors** — banker(s), legal, tax, commercial DD, ESG, integration partner, environmental, insurance broker, R&W underwriter. Each with engagement letter date, fee structure, conflicts-check status.
- **Counterparty advisors** — the same on the other side; tracked for negotiation visibility.

Conflicts-check status is enforced by the conflicts wall (§18). When a deal's `conflicts_wall_group_id` is set, no user assigned to a conflicting deal in the same wall group can be added to the team.

## §10. Due Diligence Workstreams

Replaces v1.1's Phase 2 paste-back model. DD is now a structured multi-workstream module. Phase 2 paste-back from v1.1 (MCA, eCourts, Tofler, LinkedIn, Glassdoor) becomes the **input feed for the Legal and Commercial workstreams** — the partial flag and source-verification gate are retained at the workstream level.

| Workstream | Default owner | Standard outputs | Common redflag categories |
|---|---|---|---|
| Financial | Big-4 / boutique FDD partner | QofE report, working capital reset, debt-like items list, FY3 financial model | Quality of earnings, related-party, working capital normalisation, off-book debt |
| Legal | External counsel + internal legal | Legal DD report, contract review, litigation register, IP register | Litigation, regulatory penalties, contract change-of-control, IP ownership |
| Tax | Tax DD partner | Tax DD report, indirect tax exposure, transfer pricing review | Open tax positions, GST/indirect, BEPS, carry-forward losses |
| Commercial | Strategy consultant / internal | Market sizing, competitive position, customer concentration analysis | Customer concentration, churn, pricing power, addressable market reality |
| Operations | Internal / consultant | Operations DD, capacity, supply chain | Single-source supplier, capacity ceiling, SLA defaults |
| HR | HR consultant + internal HR | Org chart, attrition, comp benchmarking, ESOP / retention plan | Key-person dependency, attrition trend, comp gaps |
| IT / Cyber | Cyber DD partner | IT DD report, cyber posture, ERP/data architecture, SaaS contracts | Breach history, cyber posture maturity, license non-compliance |
| ESG | ESG specialist | ESG DD, climate exposure, governance review, modern-slavery, anti-bribery | Climate transition risk, governance gaps, ABC/ABAC findings |
| Regulatory | External counsel + sector specialist | Sector-specific clearance map (CCI, RBI, SEBI, IRDAI, sectoral), FEMA/ODI, FDI press-note | Antitrust risk, sectoral cap, foreign-investment route, sanctions/PEP |

Each workstream record carries: `owner_user_id`, `external_advisor_id`, `status` (Not Started / In Progress / Complete / N/A-Justified), `evidence_links` (document IDs), `redflag_count`, `redflags` (list with severity, owner, mitigation), `gate_status` (Pass / Pass-with-conditions / Fail).

Workstream completion is the **gate to Stage 9 (IC Approval)**: a deal cannot enter IC without all workstreams in Complete or N/A-Justified state. The Group Admin can override the gate, with the override logged.

## §11. Investment Committee Workflow

The IC module is the highest-stakes part of the system.

**IC composition** is configured per Company tenant: voting members, alternates, observers, quorum, voting threshold (simple majority / supermajority / unanimous), tie-breaker rule. A Group-level IC overlay applies for deals over **escalation thresholds** — Group Admin defines thresholds by deal size, sector, and geography (e.g., any deal > $50m equity ticket escalates to Group IC).

**IC Proposal pack** is auto-assembled from the deal record:

- Phase 3 AI-drafted IC memo (editable by Deal Lead before submission)
- Valuation pack (versioned valuation log, sensitivity table)
- Synergy schedule (with realisation curve and one-time costs)
- Redflag rollup from all 9 DD workstreams
- Recommended terms summary (consideration, control, conditions)
- Returns view (IRR, MOIC, payback, accretion/dilution)
- Comparable deals from learning loop (§27)

**Vote workflow:**

1. Deal Lead submits → IC notified (email + Slack/Teams) → voting window opens (default 5 business days, configurable)
2. Each IC voter sees a personalised view (their role, conflicts) and casts vote: **Approve / Approve with Conditions / Reject / Recuse**
3. Each "Approve with Conditions" requires conditions in structured form (CP register seeded automatically)
4. On window close: votes tallied per voting threshold; outcome recorded; **vote and rationale immutable** (hash-chained audit event)
5. If Approved: deal moves to Stage 10 (Definitive Agreements), CP register active
6. If Approved with Conditions: same as above; CP register pre-populated with IC-imposed CPs
7. If Rejected: deal moves to **Closed — Dropped** with IC-rejection reason code

**Post-IC tracker** monitors CP closure through Stages 10–12; CP slippage triggers escalation to Deal Lead and IC Chair.

## §12. Valuation & Economics

**Valuation methodologies tracked for every deal that progresses past Phase 1:**

- **DCF** — explicit forecast period, terminal value method (Gordon / exit multiple), WACC build, sensitivity bands on revenue growth, EBITDA margin, terminal growth, WACC
- **Trading Comparables** — peer set (curated, not auto), EV/Revenue, EV/EBITDA, P/E, with size and growth control
- **Transaction Comparables** — precedent transaction multiples, control premium and synergy adjustments
- **LBO / Returns Model** (where applicable) — entry multiple, exit multiple, hold period, leverage, IRR/MOIC sweep
- **Asset / NAV** (where applicable, e.g. real estate, holding companies)

Each methodology produces a **(low, point, high)** range; the deal's **headline valuation range** is the convex hull (or curated subset) of methodologies the Deal Lead designates as primary.

**Valuation evolution log** — every recorded valuation persists with stage, methodology, who recorded, and when. The system shows the valuation curve from IOI → LOI → IC → Definitive, making valuation drift visible.

**Sensitivity table** — multidimensional sensitivity (e.g., EBITDA growth × exit multiple) stored as JSON; rendered as a heatmap in the deal cockpit.

**Synergy schedule (§13)** is a separate first-class module because it has its own lifecycle and accountability.

## §13. Synergies & Integration

**Synergy register** — every synergy hypothesis is recorded with: type (Revenue / Cost / Capital / Tax), description, year-by-year value (FY1–FY5), one-time cost to realise, owner (post-close accountable), confidence level (Probable / Possible / Aspirational), realisation start month, realisation curve.

**Dis-synergies** are tracked symmetrically — customer attrition risk, key-talent attrition risk, integration-driven service degradation.

**Integration milestones** — for Acquisition and JV deals, an integration plan is required at IC. Milestones are stored as `(milestone, owner, target_date, actual_date, status)` and tracked through Stage 13 (Post-close).

**Realisation tracking** — actual vs planned synergy realisation captured monthly post-close. Drift > 20% on any individual line item triggers an integration-tracker alert routed to the Integration Lead and Deal Lead.

## §14. Documents & Data Room

**Document store** is a per-tenant S3-compatible bucket with KMS envelope encryption (per-tenant data key). Documents are addressed by `document_id` and never directly by URL; presigned URLs are issued per-request with short TTL.

**Document taxonomy** is fixed and enforced at upload:

- Teaser, IM, MP, NDA, IOI, LOI, Term Sheet, IC Memo, Board Memo, Valuation Pack, Synergy Schedule, Integration Plan, DD Report (per workstream), Commercial Contract, Definitive Agreement (SPA/SHA/JVA/etc.), CP Register, Closing Document, Post-close Report, Other

**Versioning** — every document supports versioned upload; older versions retained with audit trail.

**NDA register** — one row per executed NDA: counterparty, effective date, expiry, scope (one-way / mutual), confidentiality term, document_id. Expiring NDAs (30/14/7 days out) trigger alerts.

**VDR linkage** — for deals at Stage 7+ (LOI onwards), the deal record carries a VDR pointer (Intralinks / Datasite / Drooms / SmartRoom): VDR URL, project code, access-list maintainer. The platform does **not** mirror VDR contents — it points to them and tracks who in the deal team has VDR access.

**Redaction state** — documents can be uploaded as "Original" or "Redacted"; UI surfaces which version a viewer is seeing. **Highly-Restricted documents** are watermarked dynamically with viewer email + timestamp on render.

**Carry-forward from v1.1:** the teaser-size UX (4 screen states from v1.1 §5/Amendment 5) maps to the document store's upload behaviour:

| File size | v2.0 behaviour |
|---|---|
| < 25 MB | Stored normally to object store; encryption + virus scan |
| 25–100 MB | Stored normally; large-file warning banner; chunked upload |
| 100–500 MB | Stored normally; admin-notified for capacity awareness |
| > 500 MB | Reference-only — filename and metadata captured; document lives in VDR; UI flags "Original held in VDR — see [VDR pointer]" |

The 4MB ceiling from v1.1 is replaced by a real object store; the *spirit* of "make incompleteness visible" is retained at the higher reference threshold.

## §15. Regulatory & Compliance Layer

Every deal carries a **regulatory clearance map** populated based on (deal_type, sector, geography, size). Standard categories tracked:

- **Antitrust / Competition** — CCI thresholds (asset/turnover), notifiability flag, Form I / Form II, suspension obligations
- **Sectoral** — RBI (banks/NBFCs), SEBI (listed entities, takeover code, insider trading), IRDAI (insurance), TRAI (telecom), CERC (power), MoEF (environmental), and others
- **Foreign exchange / FDI** — FEMA, ODI, automatic vs approval route, FDI press-note routing, sectoral caps, defence/strategic-sector flags
- **Data protection** — DPDP Act applicability, cross-border data flow restrictions, sensitive personal data
- **Sanctions / PEP** — OFAC, UN, EU sanctions screens; PEP screens on counterparties and key beneficial owners
- **Anti-bribery / Anti-corruption (ABC)** — counterparty ABAC screen, integrity DD outcome

Each item has owner, status, target clearance date, evidence document, and gate to Stage 11 (Signing) or Stage 12 (Closing). **Legal/Compliance persona** owns this layer.

For BFSI deals (carried forward from v1.1 Amendment 4), the RBI/SEBI fields are mandatory at Phase 2 entry, with the partial-flag mechanism retained.

## §16. Notifications & Alerts

Channels: in-app inbox, email, Microsoft Teams / Slack (per-tenant), WhatsApp (opt-in, per-user). Routing is per-event-type per-role.

| Event | Default routing | Trigger |
|---|---|---|
| Stage stagnation | Deal Lead, Workstream Lead, Company Admin | Configurable per stage; defaults 7d / 14d (v1.1 thresholds carried forward) |
| Expiring NDA | Deal Lead, Legal | 30/14/7 day warnings |
| IC voting deadline | IC Voter | 48h / 24h before window close |
| Vote cast | Deal Lead, IC Chair | Real-time |
| Valuation drift > X% | Deal Lead, Company Admin | When new valuation row recorded with delta > threshold (default 15%) |
| Redflag opened | Deal Lead, Workstream Lead | Real-time |
| Redflag escalated | Deal Lead, Company Admin, IC Chair | When severity = High and aged > 5d |
| CP slippage | Deal Lead, IC Chair | When CP target date passes without closure |
| Synergy drift > 20% | Integration Lead, Deal Lead | Monthly tracker |
| Document classified Highly-Restricted accessed by non-deal-team | Deal Lead, Legal, Company Admin | Real-time (audit replay) |
| Conflicts wall violation attempt | Legal, Group Admin | Real-time (action blocked) |
| Session invalidated | User, Company Admin | Real-time |

---

# Part III — Identity, Access & Security

## §17. Authentication

**Primary path: OIDC SSO** against the Group's Azure AD / Entra ID tenant (or tenant-of-tenants where Group entities have separate IdPs federated via B2B). Configured per-Company at tenant onboarding.

**Fallback path: email OTP** — retained from v1.1 (the design is sound for occasional/external use). Used for:

- External advisors (lawyers, bankers, consultants) who are not in Group SSO
- SSO-edge cases (IdP outage, Group Admin recovery)
- Initial Group-Admin bootstrap

OTP mechanics carried forward from v1.1: 6-digit, 10-minute server-side expiry, 8-hour session token (configurable), tab-scoped sessionStorage on the SPA, 3-wrong-attempts → 15-min lockout, admin session-invalidation, server-side blocklist.

**MFA** is **enforced** for IC Voter, Company Admin, Group Admin, and Legal/Compliance roles. SSO-side MFA satisfies this if the IdP enforces it; otherwise a TOTP second factor is required during OTP flow.

**Session token** is a signed JWT (asymmetric in v2.0 — moves from v1.1's symmetric to RS256 / ES256 to support multi-instance horizontal scaling). Payload: `user_id`, `company_id`, `roles[]`, `acl_summary_hash`, `iat`, `exp`, `mfa_satisfied`. Refresh-token flow with sliding 30-day window for SSO users; OTP users re-authenticate at 8h.

## §18. Authorisation Model

**RBAC base layer** — 8 base roles:

| Role | Scope | Key permissions |
|---|---|---|
| Group Admin | Group-wide | All actions across tenants except acting as a Deal Lead (separation-of-duty) |
| Company Admin | Company tenant | All actions within tenant |
| Deal Lead | Per assigned deal | Full read/write on owned deals; transition stages; assemble IC pack |
| Workstream Lead | Per assigned workstream | Read full deal, write workstream record |
| Member | Per assigned deal | Read full deal, write to assigned scope |
| IC Voter | Cross-tenant for IC-routed deals | Read IC pack; vote |
| Legal/Compliance | Per tenant or per flagged deal | Read deal; write legal/compliance records, NDA register, regulatory map |
| External Advisor | Per granted deal | Read/write only on granted scope |
| Read-only / Observer | Configurable | Read at granted scope; no writes |

**ABAC overlay** — three attribute checks layer on top of RBAC, evaluated at every request:

1. **Deal team membership** — is `user_id` in `deal.team_user_ids` (or granted via deal-share)?
2. **Conflicts wall** — does the user belong to any deal in the same `conflicts_wall_group_id`? If yes, **deny** (Chinese-wall enforcement). Group Admin can grant explicit waiver; logged.
3. **Restricted-list** — for deals with `restricted_list_flag = true`, only users explicitly named in `deal.acl_overrides` are allowed; even Company Admin needs to be added.

The combined RBAC × ABAC matrix is in **Appendix C**.

## §19. Tenant Isolation

**Postgres Row-Level Security** is enabled on every multi-tenant table. The session sets a `SET LOCAL app.current_company_id = ...` and `app.current_user_id = ...` on every request. RLS policies filter rows by `company_id` and the ABAC attribute checks above.

**Cross-tenant access** is the exception:

- Group Admin requests bypass RLS via a `SECURITY DEFINER` function with logged audit event
- Deal-share grants insert rows into `deal_acl` extending visibility to the granted user without changing `primary_company_id`

**Database connection isolation** — each request opens a connection, sets the session GUCs, runs, releases. PgBouncer in transaction-pooling mode is configured to reset session state.

## §20. Activity Log & Event Sourcing

**Append-only event store** on Postgres (`audit_events` table, partitioned by month, never deleted). ~25 event types span:

Authentication: `login`, `login_failed`, `logout`, `session_invalidated`, `mfa_challenged`, `mfa_satisfied`
Deals: `deal_created`, `deal_updated`, `stage_advanced`, `stage_reverted`, `deal_reassigned`, `deal_dropped`, `deal_closed`, `deal_reengaged`
DD: `workstream_started`, `workstream_completed`, `redflag_opened`, `redflag_closed`, `gate_overridden`
IC: `ic_proposal_submitted`, `ic_vote_cast`, `ic_decision_recorded`, `ic_cp_satisfied`, `ic_cp_slipped`
Documents: `document_uploaded`, `document_versioned`, `document_viewed`, `document_classified`
Access: `acl_granted`, `acl_revoked`, `conflicts_wall_attempted`, `restricted_list_accessed`
System: `config_changed`, `key_rotated`

**Hash-chain tamper-evidence** — events of class `ic_*` and class `legal_*` are hash-chained: each row's `hash` = SHA-256(prev_hash || canonical_event_payload). Group Admin can run a verification job to confirm the chain.

**Immutability** — the table grants `INSERT` only to the application role; `UPDATE` and `DELETE` are not granted. A separate archival path exists for compliance-mandated deletion (e.g. DPDP right-to-erasure) that records the redaction event itself in the chain.

## §21. Data Classification & Confidentiality Tiers

Four tiers, applied per-document and per-deal:

| Tier | Default for | UI behaviour | Storage behaviour |
|---|---|---|---|
| Public | Press releases, announcements | Standard render | Standard |
| Internal | Internal memos, generic notes | Standard render | Standard |
| Restricted | Most deal content | Watermark on render (viewer email + timestamp); copy-prevention on text selection | Standard + KMS |
| Highly-Restricted | NDA-bound, IC memos, definitive agreements | Watermark + view-only mode (no download unless granted); session-bound presigned URLs (60s TTL); access logged real-time | KMS + per-deal data key |

Default classification is **Restricted**. Upgrade to Highly-Restricted requires Deal Lead or Legal action.

## §22. Secrets, Encryption, Key Management

- **At rest** — Postgres TDE; object store envelope encryption with per-tenant data keys wrapped by Group KMS root key.
- **In transit** — TLS 1.3 minimum on all hops; mTLS between internal services.
- **Application secrets** — KMS-backed (AWS KMS / Azure Key Vault / on-prem HSM). The AI proxy holds Anthropic / OpenAI / Bedrock keys in KMS, not in env files.
- **JWT signing** — asymmetric (RSA-2048 or EC P-256); private key in KMS; public key distributed to services.
- **Key rotation** — annual minimum for data keys, quarterly for JWT signing key, immediate rotation on incident; rotation events in audit log.
- **Backup encryption** — backups encrypted with separate backup key; restore-test quarterly.
- **PII handling** — counterparty PII tagged in schema; DPDP-compliant; right-to-erasure path documented.

---

# Part IV — Analysis, Reporting & Learning

## §23. AI Analysis Engine

Five-phase pipeline. Phases 1 and 2 inherit the v1.1 doctrine. Phases 3–5 are new and address the IC and DD bottlenecks.

| Phase | Trigger | Inputs | Outputs | Owner | SLA |
|---|---|---|---|---|---|
| **1 — Screen** | At Sourced → Phase 1 Screen transition | Deal record fields, teaser, sector context (RAG), prior similar-sector deal verdicts | Structured screening verdict (Pass / Pass-with-flags / Drop), sector positioning, 11-section output (carried forward from v1.1) | Associate + Deal Lead sign-off | < 60s |
| **2 — Intelligence** | At Phase 2 DD Diagnostic stage | Phase 1 output + paste-back from MCA, eCourts/NCLT, Tofler, Tracxn, LinkedIn, Glassdoor/AmbitionBox (carried forward source-verification gate) + News scan; RBI/SEBI added for BFSI | Intelligence dossier, redflag candidates, partial-flag if sources incomplete | Associate | < 90s |
| **3 — IC Memo Draft** | At Confirmatory DD → IC Approval transition | All workstream outputs, valuation log, synergy schedule, redflag rollup, recommended terms | Draft IC memo (editable), exec summary, key risks, recommended conditions | Deal Lead edits before submission | < 120s |
| **4 — Valuation Sanity-Check** | At IC Approval submission OR Definitive negotiation | Valuation log, sector comp set (RAG), prior TMG deal valuations | Sanity-check note: methodology coherence, multiple reasonableness, sensitivity coverage | Deal Lead reviews | < 60s |
| **5 — DD Synthesis & Redflag Rollup** | At Confirmatory DD completion | All 9 workstream reports, redflag log | Synthesis: top 5 risks ranked, mitigation map, cross-workstream patterns | Deal Lead + Workstream Leads review | < 120s |

**LLM-agnostic** — the AI proxy abstracts the underlying model (Anthropic Claude / OpenAI GPT / Bedrock). Per-tenant model selection (some entities may have data-residency constraints requiring Bedrock-in-region).

**Prompt registry** — every phase prompt is versioned. Per-tenant overrides allowed (e.g. CDS prompt vs Energy-co prompt). Changes are PR-reviewed and tracked in the registry.

**RAG corpus** — tenant-scoped: prior deals (closed-realised + closed-dropped), sector context, internal doctrine notes, regulatory cheat-sheets. Retrieval is `company_id`-filtered; cross-tenant retrieval requires Group Admin explicit grant.

**Eval harness** — regression suite of historical deals with known verdicts. Before any prompt or model change ships, the eval suite runs and accuracy delta must be ≥ 0 on Phase 1 verdicts.

**Cost & latency budgets** — per-phase, per-tenant. Budget breach triggers alert and auto-routes to lower-cost model with banner.

## §24. Source Verification & Provenance

Every AI claim in any output carries a **provenance pointer**: which input chunk (paste-back text, document chunk, sector RAG row) produced the claim. Rendered in the UI as a hover tooltip on each sentence; full provenance available in expand-view.

Source-verification partial flag from v1.1 is retained at the deal-card level **and** extended:

- Phase 1: Internal-only; no external source gate; output is always full but tagged with confidence.
- Phase 2: Source-verification gate identical to v1.1 Amendment 4 — partial flag if any of Tracxn / MCA / Tofler / eCourts / NCLT / LinkedIn / Glassdoor / AmbitionBox empty; full flag only when all populated; RBI/SEBI mandatory for BFSI sector; "not found" paste counts as completed (carried forward verbatim from v1.1).
- Phases 3–5: Each phase's output declares which inputs were missing and tags the section accordingly.

## §25. Pipeline Analytics

The analytics layer is a fact table built from the event stream + deal snapshots, refreshed every 15 minutes. Standard dashboards:

| Dashboard | Audience | Key views |
|---|---|---|
| **Funnel Conversion** | Group Admin, Company Admin, Deal Lead | Deals at each stage; conversion rate stage-to-stage; trailing 4Q comparison; drill-down by sector / geography / deal-type |
| **Time-in-Stage** | Same | Median / p90 time in each stage; outliers list; YoY change |
| **Win/Loss Analysis** | Same | Closed-Realised vs Closed-Dropped; reason codes; sector breakdown; valuation discipline (entry vs comparable) |
| **Valuation Discipline** | Group Admin, IC Chair | Entry multiples vs sector comparable medians; deals where we paid above/below; over time |
| **Sector Concentration** | Group Admin | Pipeline value by sector; concentration risk; gap analysis vs strategy targets |
| **Origination Productivity** | Company Admin, Deal Lead | Deals sourced per channel (banker / proprietary / portfolio referral / outbound); hit-rate per channel |
| **DD Performance** | Workstream Leads, Deal Lead | Avg time per workstream; redflag density per sector; CP slippage rate |
| **IC Effectiveness** | IC Chair, Group Admin | Approval rate; conditions-imposed rate; post-IC CP closure rate; verdict-accuracy rolls forward into learning loop |

**Ad-hoc query builder** — Group Admin and Company Admin have a no-code query builder over a curated set of fact tables (deals, stages, valuations, workstreams, IC). Saved queries can be promoted to dashboards.

## §26. Reporting Layer

Auto-generated artefacts on schedule:

| Artefact | Cadence | Recipients | Source |
|---|---|---|---|
| **Weekly Pipeline Review** | Every Monday 0700 | Deal Leads, Company Admin | Snapshot: stage movement last week, alerts open, IC items due |
| **Monthly IC Pack (forward calendar + back-look)** | First business day of month | IC members, Group Admin | Items submitted this month, decisions, CP status |
| **Quarterly Board Pack** | Quarter-end + 5 business days | Group Admin, Company Admin (per board) | Pipeline snapshot, closed-deals summary, sector view, learnings |
| **Ad-hoc Deal Memo** | On demand | Configurable | Single-deal full memo from latest data |

Export formats: PPTX (templated, branded), PDF, XLSX. Templates are per-tenant editable by Company Admin.

## §27. Learning Loop

Extends v1.1 §13. Mandatory at Closed-Realised; optional at Closed-Dropped (carried forward).

- **Verdict tagging** — Phase 1, Phase 2, Phase 3 outputs each get retrospective accuracy tags (Correct / Partially-correct / Wrong) at deal close. Mandatory note on Partially-correct or Wrong.
- **Sector calibration feed** — Before Phase 1 runs on a new deal, a compact context injection of last 5 closed deals in the same sector with their verdicts and accuracy tags is appended to the prompt.
- **Doctrine refinement dashboard** — Group Admin sees: per-sector verdict accuracy rate, most common miss categories (e.g. "underestimated working capital normalisation"), trending issues. Triggers prompt updates.
- **Prompt registry + eval harness** — every prompt change is regression-tested against the closed-deal corpus.

---

# Part V — Architecture & Build Quality

## §28. System Architecture Overview

A **modular monolith** with clear module boundaries, deployable as a single artefact in v2.0 and extractable to services as load justifies. Services that benefit from independent scale on day one are extracted: AI proxy, document handler, search indexer, notification dispatcher.

```
┌──────────────────────────────────────────────────────────────┐
│                         Web SPA (Next.js)                    │
└──────────────────────────────────────────────────────────────┘
            │ HTTPS / mTLS (internal)
            ▼
┌──────────────────────────────────────────────────────────────┐
│                    API Gateway / Load Balancer                │
│            (TLS termination, rate-limit, WAF)                 │
└──────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────┐
│         Application (modular monolith — FastAPI)             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Identity │ │ Pipeline │ │   DD     │ │   IC     │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │Documents │ │Valuation │ │Reporting │ │  Audit   │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
└──────────────────────────────────────────────────────────────┘
   │         │            │             │             │
   ▼         ▼            ▼             ▼             ▼
┌──────┐ ┌────────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐
│Postgres │OpenSearch│ Object   │ │  Redis     │ │ AI Proxy   │
│(RLS)    │          │ Store    │ │(cache+queue)│ │(separate)  │
└──────┘ └────────┘ └──────────┘ └────────────┘ └────────────┘
                                                       │
                                                       ▼
                                        ┌──────────────────────┐
                                        │ Anthropic / OpenAI / │
                                        │ Bedrock (per tenant) │
                                        └──────────────────────┘
```

Workers (Celery / RQ): document virus scan, AI phase execution, notification dispatch, report generation, indexer maintenance, learning-loop snapshots.

## §29. Tech Stack (locked recommendation)

| Layer | Technology | Rationale |
|---|---|---|
| Backend language/framework | **Python 3.12 + FastAPI** | M&A domain logic benefits from Python's data-stack ecosystem (pandas / pydantic for valuation/synergy calc); FastAPI is fast, typed, OpenAPI-native |
| Database | **Postgres 16** with RLS, partitioning, JSONB | RLS gives tenant isolation by default; JSONB carries deal-type-specific extensions; mature backup/PITR |
| Cache + queue | **Redis 7** | Standard; queue via RQ |
| Search | **OpenSearch 2.x** | Full-text on deals + documents; per-tenant index aliases |
| Object store | **S3-compatible** (AWS S3 if cloud, MinIO if on-prem); KMS envelope encryption | Industry standard; presigned URLs |
| Frontend | **Next.js 15 + React 19 + TypeScript + Tailwind + shadcn/ui** | Server-side rendering for performance; typed throughout; design system primitives |
| Workers | **RQ + Celery beat** (Python) | Same language as backend; simple ops |
| AI proxy | **Separate FastAPI service** with Anthropic SDK (primary) + OpenAI + Bedrock SDKs | Vendor-agnostic; isolates LLM calls; cost/latency telemetry |
| Identity | **OIDC** (Authlib); SCIM optional in v2.x | Standard Group SSO |
| Observability | **OpenTelemetry → Loki/Tempo/Prometheus** (or Splunk if Group standard) | Vendor-neutral; integrates with Group SOC |
| CI/CD | **GitHub Actions** (or Group GitLab); Argo CD for deploys | Standard |
| Container runtime | **Docker + Kubernetes** (managed: AKS or EKS depending on Group cloud) | Horizontal scale; per-tenant resource isolation as needed |
| Infrastructure-as-code | **Terraform** | Reproducible environments |
| Secrets | **Azure Key Vault** (or AWS KMS / on-prem HSM) | Group standard |

## §30. Service Decomposition (modules within the monolith)

| Module | Responsibility | Owns tables |
|---|---|---|
| **Identity** | Auth, sessions, RBAC/ABAC evaluation, SCIM in v2.x | `users`, `roles`, `user_roles`, `sessions`, `mfa_factors` |
| **Pipeline** | Deal CRUD, stage machine, conflicts wall, deal-share grants | `deals`, `deal_versions`, `deal_acls`, `conflicts_walls` |
| **DD** | Workstream tracking, redflag log, gate evaluation | `workstreams`, `redflags`, `dd_evidence` |
| **IC** | Proposal pack, voting, CP register, post-IC tracker | `ic_proposals`, `ic_votes`, `ic_decisions`, `ic_cps` |
| **Valuation** | Valuation log, sensitivity, synergy register, integration tracker | `valuations`, `synergies`, `integration_milestones` |
| **Documents** | Upload, versioning, classification, presigned URL issuance, NDA register | `documents`, `document_versions`, `nda_register` |
| **Reporting** | Standard reports, ad-hoc query, export | `report_runs`, `saved_queries` |
| **Audit** | Append-only event store, hash-chain | `audit_events`, `audit_chain_state` |
| **Notifications** | Channel routing, template management | `notification_rules`, `notification_log` |
| **AI Proxy** (separate service) | Phase execution, prompt registry, RAG retrieval, eval harness | `prompt_versions`, `phase_runs`, `rag_documents` |

## §31. Data Model (Postgres schema sketch — illustrative)

```sql
-- Tenancy
CREATE TABLE tenants (
  tenant_id UUID PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('group','company','business_unit')),
  parent_tenant_id UUID REFERENCES tenants(tenant_id),
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  email CITEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  primary_company_id UUID NOT NULL REFERENCES tenants(tenant_id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  mfa_enrolled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id UUID REFERENCES users(user_id),
  role TEXT NOT NULL,
  scope_tenant_id UUID REFERENCES tenants(tenant_id),
  PRIMARY KEY (user_id, role, scope_tenant_id)
);

-- Conflicts wall
CREATE TABLE conflicts_walls (
  wall_id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES tenants(tenant_id),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deals
CREATE TABLE deals (
  deal_id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES tenants(tenant_id),
  deal_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  target_legal_name TEXT,
  target_cin TEXT,
  deal_type TEXT NOT NULL,           -- acquisition | minority | jv | partnership | divestiture | alliance
  sector TEXT NOT NULL,
  sub_sector TEXT,
  geography TEXT,
  currency CHAR(3),
  entry_mode TEXT NOT NULL,           -- inbound | outbound
  source_channel TEXT,
  source_contact TEXT,
  current_stage TEXT NOT NULL,
  stage_entered_at TIMESTAMPTZ NOT NULL,
  stale_threshold_days INT NOT NULL DEFAULT 14,
  is_dormant BOOLEAN NOT NULL DEFAULT false,
  is_reversal BOOLEAN NOT NULL DEFAULT false,
  reversal_count INT NOT NULL DEFAULT 0,
  deal_lead_user_id UUID REFERENCES users(user_id),
  confidentiality_tier TEXT NOT NULL DEFAULT 'restricted',
  conflicts_wall_id UUID REFERENCES conflicts_walls(wall_id),
  restricted_list_flag BOOLEAN NOT NULL DEFAULT false,
  type_extensions JSONB NOT NULL DEFAULT '{}',  -- type-specific fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_tenant_isolation ON deals
  USING (company_id = current_setting('app.current_company_id')::uuid
         OR EXISTS (SELECT 1 FROM deal_acls a
                    WHERE a.deal_id = deals.deal_id
                      AND a.user_id = current_setting('app.current_user_id')::uuid));

-- Deal team & ACL
CREATE TABLE deal_acls (
  deal_id UUID REFERENCES deals(deal_id),
  user_id UUID REFERENCES users(user_id),
  role_on_deal TEXT NOT NULL,        -- lead | workstream_lead | member | external_advisor | observer
  granted_by UUID REFERENCES users(user_id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, user_id)
);

-- Valuations (versioned)
CREATE TABLE valuations (
  valuation_id UUID PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deals(deal_id),
  version INT NOT NULL,
  stage_at_record TEXT NOT NULL,
  methodology TEXT NOT NULL,          -- dcf | trading_comps | txn_comps | lbo | asset | other
  value_low NUMERIC(20,2),
  value_point NUMERIC(20,2),
  value_high NUMERIC(20,2),
  currency CHAR(3) NOT NULL,
  sensitivity JSONB,
  recorded_by UUID REFERENCES users(user_id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, version, methodology)
);

-- Workstreams
CREATE TABLE workstreams (
  workstream_id UUID PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deals(deal_id),
  workstream TEXT NOT NULL,           -- financial | legal | tax | commercial | ops | hr | it | esg | regulatory
  owner_user_id UUID REFERENCES users(user_id),
  external_advisor_id UUID,
  status TEXT NOT NULL,               -- not_started | in_progress | complete | n_a_justified
  evidence_doc_ids UUID[],
  redflag_count INT NOT NULL DEFAULT 0,
  gate_status TEXT,                   -- pass | pass_with_conditions | fail
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, workstream)
);

-- IC
CREATE TABLE ic_proposals (
  proposal_id UUID PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deals(deal_id),
  submitted_by UUID REFERENCES users(user_id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pack_doc_id UUID,
  voting_window_close TIMESTAMPTZ NOT NULL,
  outcome TEXT,                       -- approved | approved_with_conditions | rejected
  outcome_recorded_at TIMESTAMPTZ
);

CREATE TABLE ic_votes (
  vote_id UUID PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES ic_proposals(proposal_id),
  voter_user_id UUID REFERENCES users(user_id),
  vote TEXT NOT NULL,                 -- approve | approve_w_conditions | reject | recuse
  rationale TEXT,
  conditions JSONB,
  cast_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hash_prev BYTEA,
  hash_self BYTEA NOT NULL,
  UNIQUE (proposal_id, voter_user_id)
);

-- Documents
CREATE TABLE documents (
  document_id UUID PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deals(deal_id),
  taxonomy TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'restricted',
  current_version_id UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_versions (
  version_id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(document_id),
  version_number INT NOT NULL,
  storage_key TEXT NOT NULL,           -- object-store key
  size_bytes BIGINT NOT NULL,
  sha256 BYTEA NOT NULL,
  uploaded_by UUID REFERENCES users(user_id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_redacted BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (document_id, version_number)
);

-- Audit
CREATE TABLE audit_events (
  event_id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  company_id UUID NOT NULL,
  user_id UUID,
  deal_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL,
  hash_prev BYTEA,
  hash_self BYTEA NOT NULL
) PARTITION BY RANGE (occurred_at);
```

The above is illustrative — full DDL with indexes, partitioning policy, RLS for every multi-tenant table, and migration scripts is a Sprint-0 deliverable.

## §32. API Design

- **OpenAPI 3.1 contract** is the source of truth. Backend (FastAPI) auto-generates the contract from typed handlers; frontend generates a TypeScript client from it.
- **REST resource model** — `/v1/deals/{deal_id}`, `/v1/deals/{deal_id}/stages`, `/v1/deals/{deal_id}/workstreams/{workstream}`, etc.
- **Idempotency** — all writes accept an `Idempotency-Key` header; replays return the original response.
- **Pagination** — cursor-based (`?cursor=...&limit=50`); never offset on large tables.
- **Webhooks** — outbound webhooks on deal-state-transition, IC-decision, document-uploaded; signed with HMAC-SHA256; per-tenant subscriber config.
- **Versioning** — URL-path versioning (`/v1/...`); breaking changes ship as `/v2/...`; deprecation schedule documented.
- **Rate limits** — per-user (60 rpm default), per-tenant (5000 rpm default), AI-phase endpoints have separate budget.
- **Error model** — RFC 7807 Problem Details; `trace_id` echoed in every response.

## §33. Frontend Architecture

- **Next.js 15** with App Router; React 19; TypeScript strict.
- **Role-aware shell** — top-nav and sidebar derive from session role; routes guarded server-side and client-side.
- **Deal cockpit** — single-page deal view with tabs (Overview, Workstreams, Valuation, Synergies, Documents, IC, Audit). Tab content lazy-loaded.
- **Kanban pipeline board** — drag-drop with optimistic updates and server reconciliation; partial-flag and confidentiality badges visible on cards.
- **IC console** — for IC voters; voting UI; CP register; conditions editor.
- **Document viewer** — PDF + DOCX + XLSX in-browser; redaction-aware; watermark overlay rendered client-side; copy-prevention via CSS + JS for Restricted+; right-click and clipboard intercepted on Highly-Restricted.
- **Analytics dashboards** — built on a curated query layer; filters persist in URL.
- **Component library** — shadcn/ui + Tailwind; design tokens for TMG branding; per-tenant theming hook.
- **Accessibility** — WCAG 2.1 AA target.
- **Offline tolerance** — read-only graceful degradation if API unreachable; writes queue with explicit user feedback.

## §34. AI Layer Architecture

- **AI Proxy** is a separate FastAPI service so it can be scaled, redeployed, and re-vendored independently.
- **Prompt registry** — `prompt_versions` table with `phase`, `tenant_id (nullable for global)`, `version`, `prompt_text`, `created_by`, `created_at`. PRs against the registry require codeowner approval.
- **Model routing** — config per tenant: primary model, fallback model, max-cost-per-call, max-latency-per-call. Breach routes to fallback.
- **RAG** — OpenSearch hybrid (BM25 + vector) per tenant; embeddings via the same vendor as the LLM where possible. Retrieval filters by `company_id` and confidentiality tier.
- **Eval harness** — historical-deals corpus with ground-truth verdicts; CI job runs eval on every prompt or model change; gate set on accuracy delta and cost delta.
- **Provenance** — every output is post-processed to attach `(span, source_doc_id, source_chunk_id)` triples; UI consumes these for hover-citations.
- **Cost & latency telemetry** — every phase run records tokens, latency, vendor, model; aggregated to dashboard.

## §35. Observability

- **Tracing** — OpenTelemetry; every API request gets a `trace_id`; `deal_id` and `company_id` propagated as span attributes; AI phase calls traced end-to-end.
- **Metrics** — RED (rate / errors / duration) per route; saturation per service; AI phase success rate per tenant; queue depths.
- **Logging** — structured JSON; deal_id correlation; redaction filter for PII and document content; logs to Loki or Splunk.
- **SLOs** — p95 API latency < 300ms (excluding AI); p95 AI Phase 1 < 60s, Phase 3 < 120s; uptime 99.9% on prod; error budget burndown alerted.
- **Alerting** — PagerDuty / Opsgenie integration; alert routing by severity and module ownership.

## §36. Deployment, Environments & DR

- **Environments** — dev, staging, prod. Per-tenant test environment available on request.
- **Deploys** — Argo CD with progressive rollout (10% → 50% → 100%); auto-rollback on SLO breach.
- **Backups** — Postgres logical (nightly) + WAL archiving for PITR; object store versioning + cross-region replication; OpenSearch snapshots daily.
- **DR** — RPO 15 minutes, RTO 4 hours; documented runbook; quarterly DR drill.
- **Per-tenant export** — Group Admin can export a tenant's full data (Postgres dump + object-store contents + audit) on request; supports Group exit-clauses and DPDP portability.
- **Data residency** — per-tenant region selection; in-region storage, processing, and AI vendor enforced.

## §37. Code Quality & Engineering Practice

- **Typed everywhere** — Python `mypy --strict` on domain layer; TypeScript strict on frontend.
- **Style / lint** — ruff + black on Python; eslint + prettier on TypeScript; pre-commit hooks enforce.
- **Test pyramid** — Unit (each module's domain logic) → Contract (OpenAPI fixtures) → Integration (Postgres-backed, real RLS) → E2E (Playwright on staging). Coverage gate ≥ 80% on domain layer; ≥ 60% overall; PRs cannot merge below threshold.
- **Security testing** — SAST (Bandit / Semgrep), DAST (OWASP ZAP) on staging, SCA (Snyk / Trivy) on every dependency change, container scan, secrets scan (gitleaks).
- **Code review** — required PR review with **CODEOWNERS** per module; security-sensitive files (auth, ABAC, audit) require additional reviewer from the security team.
- **Trunk-based** — short-lived branches; merge daily; feature flags for incomplete work.
- **CI/CD** — GitHub Actions; matrix tests; deploy to staging on merge; deploy to prod on tag.
- **Performance testing** — k6 load tests on every release candidate; baseline + regression bands.
- **Documentation** — runbooks per module; on-call rotation; postmortem culture.

## §38. Performance & Scalability Targets

| Surface | Target | Scale plan |
|---|---|---|
| API p95 latency (CRUD) | < 300 ms | Horizontal Postgres replicas (read); query plan review |
| API p99 latency (CRUD) | < 800 ms | Same |
| AI Phase 1 latency p95 | < 60 s | Streaming where possible; smaller-context prompts |
| AI Phase 3 (IC memo) latency p95 | < 120 s | Async with progress UI |
| Concurrent users (peak) | 500 across Group | Stateless API; horizontal scale; Redis cache |
| Deals managed | 50,000 over 5 years | Postgres with table partitioning on `audit_events`; archival policy |
| Document store | 5 TB after 5 years | S3-tier lifecycle; cold storage past 2 years |
| Uptime | 99.9% prod | Multi-AZ; documented incident response |
| Archival policy | Closed-deal data retained 7 years (regulatory) | Cold-tier object store + Postgres partition archive |

---

# Part VI — Build Sequence

## §39. Pre-build Checklist (Group-level)

| # | Item | Owner | Status |
|---|---|---|---|
| G1 | Confirm list of TMG entities in scope for v2.0 (and IC composition per entity) | Surya + Group Leadership | Pending |
| G2 | Confirm SSO IdP — Azure AD / Entra tenant configuration; B2B federation if multi-IdP | Group IT | Pending |
| G3 | KMS / Key Vault provisioned; root key, per-tenant data keys, JWT signing key | Group IT | Pending |
| G4 | Hosting decision — internal Azure / on-prem / hybrid; data residency requirements per tenant | Group IT + Surya | Pending |
| G5 | AI vendor selection — Anthropic primary; OpenAI / Bedrock as configured; commercial agreement; data-processing addendum | Surya + Group Legal | Pending |
| G6 | IC governance baseline — voting thresholds, escalation thresholds, quorum rules per company | Group Leadership | Pending |
| G7 | VDR vendor strategy — which VDRs are linkable (Intralinks / Datasite / Drooms / SmartRoom) | Surya | Pending |
| G8 | Conflicts-wall policy — definition of conflict groups; waiver authority | Group Legal | Pending |
| G9 | Document classification policy — defaults per document taxonomy; watermark template | Group Legal + Surya | Pending |
| G10 | DPDP compliance — DPO nomination; data-subject-request workflow | Group Legal | Pending |
| G11 | Phase 1 doctrine test — 5 real Dropped deals across sectors; verdict-accuracy baseline | Surya + Rohit + Mridul | Pending |

Items G1–G5 are **build-blocking**. Items G6–G11 can proceed during Sprint 0 with reasonable defaults.

## §40. Sprint Plan

| Sprint | Theme | Key deliverables | Exit criteria |
|---|---|---|---|
| **Sprint 0** (4w) | Foundations | Tenancy + RLS; auth (SSO + OTP) + MFA; audit log with hash-chain; base UI shell; observability skeleton; CI/CD; staging env | A user from CDS tenant can log in via SSO to an empty workspace; every action is audit-logged |
| **Sprint 1** (4w) | Pipeline core | Deal CRUD; stage machine (12 stages, 6 deal types); kanban board; deal cockpit shell; document upload (basic) | A deal can move through all stages with audit and stage-gate enforcement |
| **Sprint 2** (4w) | DD + Counterparties | DD module (9 workstreams, redflag log, gate eval); counterparties; advisors; NDA register; document classification; conflicts wall MVP | A deal can complete DD with workstream sign-off; conflicts wall blocks an attempted assignment |
| **Sprint 3** (4w) | AI Phases 1–2 + Source Verification | AI proxy; Phase 1; Phase 2; source-verification gate; partial-flag rendering; eval harness baseline | Phase 1 and Phase 2 run on a real deal in < 60s and < 90s respectively with provenance |
| **Sprint 4** (4w) | IC + Valuation + Synergies + Phase 3 | IC workflow (proposal, voting, CPs); valuation versioning + sensitivity; synergy register; Phase 3 IC memo draft | A deal can be submitted to IC, voted on, and approved with conditions; IC memo auto-drafts |
| **Sprint 5** (4w) | Analytics + Reporting + Phases 4–5 | Pipeline analytics dashboards; weekly/monthly/quarterly auto-reports; ad-hoc query builder; Phase 4 + Phase 5 | Group Admin sees pipeline funnel and runs ad-hoc query; Monthly IC pack auto-generates |
| **Sprint 6** (4w) | Hardening + Notifications + Learning Loop + Integrations | Notification routing (email + Teams + WhatsApp); learning-loop dashboard; verdict tagging at close; outbound webhooks; CRM integration stub | All notification channels live; closed-deal feeds doctrine; one external integration validated |

**Total: 28 weeks (~7 months) to v2.0 GA.** Sprint 0 + 1 + 2 (12w) yield a deployable MVP without AI; AI ships in Sprint 3.

## §41. v2 Roadmap (post-launch)

| Feature | Notes |
|---|---|
| Proactive market intelligence module | Watchlists, sector signals, portfolio company alerts; separate ingestion pipeline |
| Native mobile (iOS/Android) | After 3 months of usage data |
| OCR for image-based teasers | Native ingestion of scanned documents |
| Regional language teaser processing | Hindi / regional Indian languages; sector vocab tuned |
| Live MCA / eCourts API integration | Replaces paste-back where API SLAs are acceptable |
| Conversational IC copilot ("ask the deal") | RAG over deal corpus + voice-of-IC |
| SCIM provisioning | Auto-provisioning from Group HR |
| External advisor portal | Branded sub-portal for legal/banker |
| Sector-specialised AI prompts | Energy, BFSI, FMCG, infra-specific Phase 1 |

---

# Part VII — Migration

## §42. v1.1 → v2.0 Migration

**Plan:** CDS becomes the **first tenant** of v2.0. v1.1 continues to operate in parallel during build; cutover at v2.0 GA.

**Steps:**

1. **Sprint 0 in parallel** — CDS team continues to use v1.1 daily. v2.0 environment provisioned; CDS users provisioned via SSO; CDS tenant configured.
2. **Sprint 5 — UAT begins** — CDS team starts using v2.0 staging on every new deal alongside v1.1; data is dual-entered for ~10 deals.
3. **Sprint 6 — UAT widens** — Full CDS deal flow on v2.0 staging; v1.1 used as read-only reference.
4. **Cutover (post-Sprint 6)** —
   - One-shot migration script exports v1.1 shared-storage JSON; transforms to v2.0 schema; loads into Postgres.
   - Documents (base64 in v1.1) extracted to object store with KMS encryption.
   - Audit log migrated as historical events with `migrated_from_v1_1=true` flag; new events hash-chain forward from migration anchor.
   - v1.1 frozen in read-only mode for 90 days as fallback; then archived.
5. **Cutover criteria** —
   - All open CDS deals successfully migrated and validated by Surya
   - End-to-end Phase 1 → Phase 2 → IC submission tested on three deals in v2.0
   - Group SSO works for all CDS users; OTP fallback validated for one external advisor
   - Audit chain verified

**Then onboard the next entity** — based on Group readiness (G1).

---

# Part VIII — Open Items, Appendices

## §43. Open Items

| # | Item | Type | Default | Decision needed by |
|---|---|---|---|---|
| 1 | Tenants in scope for v2.0 launch (which TMG entities) | Strategic | CDS-only at GA, others phased | Pre-build (G1) |
| 2 | IC voting thresholds per entity | Governance | Simple majority for ≤ $25m, supermajority above | Sprint 4 entry |
| 3 | Conflicts-wall waiver authority | Governance | Group Admin only | Sprint 2 entry |
| 4 | Default confidentiality tier per document type | Policy | Restricted; IC Memo, Definitive → Highly-Restricted | Sprint 2 entry |
| 5 | AI vendor primary | Commercial | Anthropic Claude (Opus 4.7 + Sonnet 4.6) | Pre-build (G5) |
| 6 | Per-tenant data residency | Compliance | India-only for India entities; configurable | Pre-build (G4) |
| 7 | WhatsApp notifications opt-in default | UX | Off by default, user opts in | Sprint 6 entry |
| 8 | Retention beyond 7 years (post-archival) | Compliance | Delete after 10 years unless legal hold | Pre-launch |
| 9 | Group IC composition for cross-entity escalations | Governance | Surya + 2 nominees per entity affected + Group CFO | Sprint 4 entry |
| 10 | External advisor billing model (if any) | Commercial | No charge in v2.0; revisit | v2.x |

## Appendix A — Stage matrix per deal type

| Stage | Acquisition | Minority | JV | Partnership | Divestiture | Alliance |
|---|---|---|---|---|---|---|
| Sourced | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| NDA | ✓ | ✓ | ✓ | ✓ (lite) | ✓ | ✓ (lite) |
| IOI | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Phase 1 Screen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mgmt Engagement | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Phase 2 DD Diagnostic | ✓ | ✓ | ✓ | ✓ (lite) | ✓ | ✓ (lite) |
| LOI / Term Sheet | ✓ | ✓ | ✓ | ✓ (HoT) | ✓ | ✓ (HoT) |
| Confirmatory DD | ✓ (full 9 ws) | ✓ (8 ws — ESG optional) | ✓ (full 9 ws + IP focus) | ✓ (legal + commercial) | ✓ (vendor DD lens) | ✓ (legal + commercial) |
| IC Approval | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Definitive Agreements | SPA | SSA + SHA | JVA + SHA | MSA / SPA | SPA / APA | Alliance Agreement |
| Signing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Closing | ✓ | ✓ | ✓ (NewCo formation) | ✓ | ✓ | ✓ |
| Post-close / Integration | ✓ (full integration) | ✓ (board observer setup) | ✓ (NewCo operating cadence) | ✓ (KPI tracking) | ✓ (TSA) | ✓ (KPI tracking) |
| Closed — Realised / Dropped | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Appendix B — Field dictionary (excerpt)

Full dictionary maintained as a separate spreadsheet artefact — referenced from the build repo. The spec ships with ~180 canonical fields across the deal entity, valuations, synergies, workstreams, IC, documents, and counterparties.

## Appendix C — Role permission matrix (RBAC × ABAC)

Matrix maintained as a spreadsheet artefact (~120 actions × 9 roles). Excerpt:

| Action | Group Admin | Company Admin | Deal Lead | Workstream Lead | Member | IC Voter | Legal | Ext Advisor | Read-only |
|---|---|---|---|---|---|---|---|---|---|
| Create deal | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Reassign deal | ✓ | ✓ | ✓ (own) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Drop deal | ✓ | ✓ | ✓ (own) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Transition stage | ✓ | ✓ | ✓ (own, gates) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Edit valuation | ✓ | ✓ | ✓ (own) | ✓ (own ws) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Submit IC pack | ✓ | ✓ | ✓ (own) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Cast IC vote | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (assigned) | ✗ | ✗ | ✗ |
| Override DD gate | ✓ | ✓ (logged) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| View Highly-Restricted | ✓ (logged) | ✓ (deal team only) | ✓ (own) | ✓ (own ws) | ✓ (own deal) | ✓ (assigned) | ✓ (legal-flagged) | ✓ (granted) | ✗ |
| Export tenant data | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Configure SSO | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Edit prompt registry | ✓ | ✓ (tenant override) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

ABAC overlay: every "✓" above is also gated on conflicts-wall and restricted-list checks where applicable.

## Appendix D — Event taxonomy (audit log)

25 event types across 8 classes — listed in §20. Hash-chained classes: `ic_*`, `legal_*`, `deal_dropped`, `deal_closed`, `acl_granted`, `acl_revoked`, `gate_overridden`, `key_rotated`. Non-hash-chained classes are still append-only and immutable.

## Appendix E — Standard reports catalogue

| Report | Cadence | Audience | Format |
|---|---|---|---|
| Weekly Pipeline Review | Weekly | Deal Leads, Company Admin | PPTX + email summary |
| Monthly IC Forward Calendar | Monthly | IC members | PPTX |
| Monthly IC Backlook | Monthly | IC members, Group Admin | PPTX |
| Quarterly Board Pack — Pipeline | Quarterly | Company Boards, Group Admin | PPTX |
| Quarterly Board Pack — Closed Deals | Quarterly | Company Boards, Group Admin | PPTX |
| Half-yearly Sector Concentration | Half-yearly | Group Admin | PDF |
| Annual Verdict-Accuracy Doctrine Review | Annual | Group Admin, Surya | PDF |
| Ad-hoc Single-Deal Memo | On demand | Configurable | PDF |
| Closed-deal verdict tagging report | On close | Surya | PDF |

## Appendix F — Glossary

ABAC, ACL, APA, BD, BFSI, CCI, CDS, CIN, CP, DD, DPDP, ESG, FDI, FEMA, HoT, IC, IM, IOI, IP, IRR, JV, JVA, KMS, LBO, LOI, MAC, MOIC, MP, MSA, NCLT, NDA, ODI, OIDC, OTP, PEP, PPTX, RAG, RBAC, RBI, RFP, RLS, SAST, SCA, SCIM, SEBI, SHA, SLO, SOC, SPA, SSA, SSO, TDE, TMG, TSA, VDR, WACC.

(Definitions maintained as a build artefact alongside the field dictionary.)

## Appendix G — v1.1 → v2.0 traceability

| v1.1 Section / Amendment | v2.0 Section | Status |
|---|---|---|
| §1 (Executive Summary, v1.0) | §1 | Replaced |
| §2 (Identity & Access, v1.0 PIN) | §17, §18, §19 | Replaced (PIN dropped, SSO+OTP added) |
| §2 (v1.1 Email OTP, Amendment 1+2) | §17 | Carried forward, extended with SSO |
| §2.3 (User Roster & Hierarchy, v1.1) | §6, §18 | Carried forward, extended to multi-tenant |
| §3 (Pipeline & Stages, v1.0) | §7 | Replaced (10 generic stages → 12 canonical M&A stages) |
| §3.4 (Reversal / re-engagement, v1.0) | §7 (is_reversal flag) | Carried forward |
| §5 (Phase 1 Screen, v1.0) | §23 (Phase 1) | Carried forward, extended |
| §5.2 (Phase 2 Intelligence, v1.0) | §23 (Phase 2) + §24 | Carried forward |
| §5.2 / Amendment 4 (Source verification) | §24 | Carried forward verbatim in spirit, extended to all 5 phases |
| §9.3 (Data limits, v1.0) | §14 (document size states) | Replaced — proper object store, threshold at 500MB instead of 4MB |
| §9.5 (Backend proxy) | §28, §34 | Replaced — proxy split into AI proxy + main API |
| Amendment 5 (Storage ceiling UX) | §14 | Carried forward in updated form |
| Amendment 6 (Out-of-scope acknowledgment) | §5 | Carried forward |
| Amendment 7 (Learning loop, v2 roadmap in v1.1) | §27 | Promoted from roadmap to in-scope for v2.0 |
| §10.1 (Out of scope, v1.0) | §5 | Carried forward |
| §13 (Learning loop, v1.1) | §27 | Carried forward, extended |
| Pre-build checklist items 12–16 (v1.1) | §39 (G2–G6) | Carried forward, extended to Group items G1, G7–G11 |
| Sprint 1 / Sprint 2 plans (v1.1) | §40 | Replaced — 7-sprint plan |

---

This document, combined with **Appendix A–G**, the field dictionary, and the role-permission matrix, constitutes the complete v2.0 build specification. v2.0 supersedes v1.1 in its entirety; v1.1 is retained only for migration reference (Part VII). Build commences on resolution of pre-build items **G1–G5**.

**TMG · Group M&A Pipeline Tracker · Build Specification v2.0 · Confidential**
