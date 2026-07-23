/**
 * Demo Data Seed — Ringside
 *
 * Populates a realistic-but-ENTIRELY-SYNTHETIC pipeline for demo / testing /
 * boss-review purposes. Every company name, person, and number below is
 * fictional. There is NO MNPI and NO real Manipal deal content here.
 *
 * What it creates (idempotent — safe to re-run):
 *   6 targets aligned to Manipal verticals (healthcare / education / hospitality),
 *   spread across the full Kanban lifecycle (Sourcing → ... → Signing, + 1 dropped).
 *   Each carries: milestone (stage), interactions (call notes), actions (to-dos),
 *   and — for the mid/late-stage deals — valuations, deal economics, IC sessions,
 *   NDA records, and key sponsors.
 *
 * Idempotency: every target uses a `DEMO-###` target_code. On re-run the script
 * deletes all DEMO-* targets (cascading to children via FK) before re-inserting,
 * so real data is never touched.
 *
 * Writes go through the app's own RLS path (set app.company_id GUC + SET ROLE
 * app_rls), identical to how the API writes in production. If this script
 * succeeds, the app's write path is proven against the live schema/RLS.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed:demo
 *
 * Requires the same PG env vars as the API server, AND that the API server has
 * been booted once (so tables + RLS policies + app_rls role exist).
 */

import pg from "pg";

const { Pool } = pg;

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

function getDatabaseUrl(): string {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    const port = PGPORT ?? "5432";
    return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${port}/${PGDATABASE}`;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "No DB connection: set PGHOST/PGUSER/PGPASSWORD/PGDATABASE or DATABASE_URL.",
    );
  }
  return url;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  ${msg}`);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function daysAgo(n: number): string {
  return daysFromNow(-n);
}

// ── Synthetic deal definitions ────────────────────────────────────────────────
//
// All names/numbers are invented. Verticals mirror Manipal's (healthcare,
// education, hospitality) so strategic-fit fields look realistic.

interface InteractionSeed {
  type: string;
  daysAgo: number;
  internal: string;
  external: string;
  summary: string;
  sentiment: string;
}

interface ActionSeed {
  description: string;
  owner: string;
  dueOffsetDays: number; // relative to today; negative = overdue
  priority: string;
  status: string;
  workstream: string;
}

interface DealSeed {
  code: string;
  project: string;
  legalName: string;
  vertical: "Healthcare" | "Education" | "Hospitality";
  sector: string;
  subsector: string;
  region: string;
  country: string;
  dealOwner: string;
  priorityTier: string;
  stage: string;
  ndaStatus: string;
  commercialDd: string;
  financialDd: string;
  legalDd: string;
  rationale: string;
  fitScore: number;
  synergyScore: number;
  financialScore: number;
  processScore: number;
  riskPenalty: number;
  interactions: InteractionSeed[];
  actions: ActionSeed[];
  // Optional richer detail for mid/late-stage deals:
  valuation?: { method: string; low: string; point: string; high: string; currency: string };
  economics?: { cashPct: string; equityPct: string; ev: string; irrBase: string; moicBase: string };
  icSession?: { daysAgo: number; outcome: string; notes: string };
  nda?: { counterparty: string; effectiveDaysAgo: number; termMonths: number; status: string };
  sponsors?: { name: string; role: string }[];
  dropped?: { category: string; detail: string };
}

const DEALS: DealSeed[] = [
  // 1 — Early stage, just sourced
  {
    code: "DEMO-001",
    project: "Project Atlas",
    legalName: "Atlas HealthTech Platforms Pvt Ltd (fictional)",
    vertical: "Healthcare",
    sector: "HealthTech",
    subsector: "Clinical Workflow SaaS",
    region: "South Asia",
    country: "India",
    dealOwner: "R. Sharma",
    priorityTier: "Watchlist",
    stage: "Sourcing",
    ndaStatus: "Not Sent",
    commercialDd: "Not Started",
    financialDd: "Not Started",
    legalDd: "Not Started",
    rationale:
      "Bolt-on clinical-workflow SaaS that could digitise outpatient scheduling across Manipal clinics. Early — thesis untested.",
    fitScore: 6,
    synergyScore: 5,
    financialScore: 4,
    processScore: 2,
    riskPenalty: 2,
    interactions: [
      {
        type: "Intro Call",
        daysAgo: 5,
        internal: "R. Sharma",
        external: "Promoter (fictional)",
        summary:
          "Initial intro. Promoter shared top-line revenue (~₹40Cr FY25, unverified) and customer count. No materials shared yet.",
        sentiment: "Neutral",
      },
    ],
    actions: [
      {
        description: "Request teaser deck and historical financials",
        owner: "R. Sharma",
        dueOffsetDays: 3,
        priority: "High",
        status: "Open",
        workstream: "Sourcing",
      },
      {
        description: "Schedule deep-dive on clinical workflow product",
        owner: "Deal Team",
        dueOffsetDays: 10,
        priority: "Medium",
        status: "Open",
        workstream: "Commercial",
      },
    ],
  },

  // 2 — NDA signed, CIM received
  {
    code: "DEMO-002",
    project: "Project Borealis",
    legalName: "Borealis Learning Systems Pvt Ltd (fictional)",
    vertical: "Education",
    sector: "EdTech",
    subsector: "Higher-Ed Content",
    region: "South Asia",
    country: "India",
    dealOwner: "R. Sharma",
    priorityTier: "Active",
    stage: "CIM Review",
    ndaStatus: "Signed",
    commercialDd: "Not Started",
    financialDd: "Not Started",
    legalDd: "Not Started",
    rationale:
      "Content library + faculty network that could extend Manipal's higher-ed offering into allied health certifications. CIM under review.",
    fitScore: 7,
    synergyScore: 7,
    financialScore: 6,
    processScore: 5,
    riskPenalty: 1,
    interactions: [
      {
        type: "Management Presentation",
        daysAgo: 12,
        internal: "R. Sharma, Corp Dev Analyst",
        external: "CEO, CFO (fictional)",
        summary:
          "Walked through CIM. Revenue ₹95Cr FY25, 32% EBITDA margin claimed. ~180k enrolled learners. Concentration risk in top 3 university clients (~45% revenue).",
        sentiment: "Positive",
      },
      {
        type: "Email",
        daysAgo: 3,
        internal: "Deal Team",
        external: "Sell-side banker (fictional)",
        summary: "Clarifying questions sent on customer concentration and renewal economics. Awaiting response.",
        sentiment: "Neutral",
      },
    ],
    actions: [
      {
        description: "Complete CIM review and circulate preliminary view",
        owner: "R. Sharma",
        dueOffsetDays: 2,
        priority: "High",
        status: "Open",
        workstream: "Commercial",
      },
      {
        description: "Build customer-concentration sensitivity model",
        owner: "Corp Dev Analyst",
        dueOffsetDays: 7,
        priority: "High",
        status: "Open",
        workstream: "Financial",
      },
      {
        description: "Prepare NDA follow-up for data-room access",
        owner: "Legal",
        dueOffsetDays: 5,
        priority: "Medium",
        status: "Open",
        workstream: "Legal",
      },
    ],
    nda: { counterparty: "Borealis Learning Systems", effectiveDaysAgo: 20, termMonths: 24, status: "Active" },
  },

  // 3 — Mid stage, diligence in progress, IC session held
  {
    code: "DEMO-003",
    project: "Project Citadel",
    legalName: "Citadel Care Hospitals Pvt Ltd (fictional)",
    vertical: "Healthcare",
    sector: "Hospitals",
    subsector: "Secondary Care Chain",
    region: "South Asia",
    country: "India",
    dealOwner: "R. Sharma",
    priorityTier: "Must-Win",
    stage: "Diligence",
    ndaStatus: "Signed",
    commercialDd: "In Progress",
    financialDd: "In Progress",
    legalDd: "In Progress",
    rationale:
      "3-hospital secondary-care chain in tier-2 cities, contiguous to Manipal's existing network. Platform-extension thesis with clear capacity and catchment synergies.",
    fitScore: 9,
    synergyScore: 8,
    financialScore: 7,
    processScore: 7,
    riskPenalty: 2,
    interactions: [
      {
        type: "Site Visit",
        daysAgo: 18,
        internal: "R. Sharma, Clinical Lead, CFO office",
        external: "Citadel COO (fictional)",
        summary:
          "Visited 2 of 3 facilities. Asset condition good, occupancy 68% (vs 75% claimed). EBITDA margin 18% trailing — below network average of 22%. Clear margin-uplift levers via procurement and rostering.",
        sentiment: "Positive",
      },
      {
        type: "Diligence Call — Financial",
        daysAgo: 8,
        internal: "CFO office",
        external: "Citadel CFO (fictional)",
        summary:
          "Reviewed working-capital normalisation and capex backlog (~₹12Cr deferred). Agreeing treatment in EV bridge. Revenue quality solid; payer mix 55% cash / 30% insurance / 15% govt.",
        sentiment: "Positive",
      },
      {
        type: "IC Session",
        daysAgo: 4,
        internal: "Investment Committee",
        external: "—",
        summary:
          "IC reviewed interim diligence. Directionally supportive pending commercial DD close and final valuation. Requested downside case at -15% revenue.",
        sentiment: "Positive",
      },
    ],
    actions: [
      {
        description: "Close commercial DD — catchment and referral-flow analysis",
        owner: "Commercial DD advisor",
        dueOffsetDays: -1,
        priority: "High",
        status: "Open",
        workstream: "Commercial",
      },
      {
        description: "Finalise EV bridge and agree working-capital peg",
        owner: "CFO office",
        dueOffsetDays: 4,
        priority: "High",
        status: "Open",
        workstream: "Financial",
      },
      {
        description: "Legal DD — land/title verification for 3 hospital plots",
        owner: "Legal DD advisor",
        dueOffsetDays: 6,
        priority: "High",
        status: "Open",
        workstream: "Legal",
      },
      {
        description: "Build downside case (-15% revenue) for next IC",
        owner: "R. Sharma",
        dueOffsetDays: 3,
        priority: "Medium",
        status: "Open",
        workstream: "Financial",
      },
    ],
    valuation: { method: "EV/EBITDA + DCF", low: "₹480Cr", point: "₹560Cr", high: "₹640Cr", currency: "INR" },
    economics: { cashPct: "70%", equityPct: "30%", ev: "₹560Cr", irrBase: "21%", moicBase: "2.4x" },
    icSession: {
      daysAgo: 4,
      outcome: "Proceed to final diligence",
      notes: "Supportive. Conditions: close commercial DD, confirm downside case, validate ₹14Cr synergy run-rate.",
    },
    nda: { counterparty: "Citadel Care Hospitals", effectiveDaysAgo: 45, termMonths: 24, status: "Active" },
    sponsors: [
      { name: "Dr. A. Iyer (fictional)", role: "Promoter & CMD" },
      { name: "Ms. K. Rao (fictional)", role: "CFO" },
    ],
  },

  // 4 — Late stage, non-binding offer submitted
  {
    code: "DEMO-004",
    project: "Project Delta",
    legalName: "Delta Analytics Labs Pvt Ltd (fictional)",
    vertical: "Education",
    sector: "Technology",
    subsector: "Learning Analytics SaaS",
    region: "South Asia",
    country: "India",
    dealOwner: "R. Sharma",
    priorityTier: "Must-Win",
    stage: "Non-Binding Offer",
    ndaStatus: "Signed",
    commercialDd: "Complete",
    financialDd: "Complete",
    legalDd: "In Progress",
    rationale:
      "SaaS learning-analytics platform with strong retention (118% NRR) that would underpin Manipal's student-outcome measurement. Tuck-in to existing ed-tech stack.",
    fitScore: 8,
    synergyScore: 7,
    financialScore: 8,
    processScore: 8,
    riskPenalty: 1,
    interactions: [
      {
        type: "Offer Submission Call",
        daysAgo: 9,
        internal: "R. Sharma",
        external: "Sell-side banker (fictional)",
        summary:
          "Submitted non-binding offer at ₹220Cr EV. Banker indicated we are in the leading group of 3. Process timeline: binding round in ~4 weeks.",
        sentiment: "Positive",
      },
      {
        type: "Reference Call",
        daysAgo: 14,
        internal: "Deal Team",
        external: "Customer reference (fictional)",
        summary: "Strong product feedback; customer cited implementation quality and roadmap delivery as differentiators.",
        sentiment: "Positive",
      },
    ],
    actions: [
      {
        description: "Prepare binding-offer term sheet",
        owner: "R. Sharma",
        dueOffsetDays: 14,
        priority: "High",
        status: "Open",
        workstream: "Process",
      },
      {
        description: "Confirm financing structure for binding round",
        owner: "Treasury",
        dueOffsetDays: 10,
        priority: "High",
        status: "Open",
        workstream: "Financial",
      },
      {
        description: "Close legal DD — IP assignment and employee agreements",
        owner: "Legal DD advisor",
        dueOffsetDays: 7,
        priority: "High",
        status: "Open",
        workstream: "Legal",
      },
    ],
    valuation: { method: "Revenue multiple", low: "₹190Cr", point: "₹220Cr", high: "₹250Cr", currency: "INR" },
    economics: { cashPct: "60%", equityPct: "35%", ev: "₹220Cr", irrBase: "24%", moicBase: "2.8x" },
    nda: { counterparty: "Delta Analytics Labs", effectiveDaysAgo: 60, termMonths: 24, status: "Active" },
    sponsors: [{ name: "Mr. S. Nair (fictional)", role: "Founder & CEO" }],
  },

  // 5 — Very late stage, binding offer / signing
  {
    code: "DEMO-005",
    project: "Project Everest",
    legalName: "Everwell Resorts & Spas Pvt Ltd (fictional)",
    vertical: "Hospitality",
    sector: "Hotels & Resorts",
    subsector: "Leisure Resort Portfolio",
    region: "South Asia",
    country: "India",
    dealOwner: "R. Sharma",
    priorityTier: "Must-Win",
    stage: "Binding Offer",
    ndaStatus: "Signed",
    commercialDd: "Complete",
    financialDd: "Complete",
    legalDd: "Complete",
    rationale:
      "4-resort leisure portfolio across gateway leisure destinations. Acquisitive fit with Manipal hospitality vertical; asset-backed downside and RevPAR uplift potential post-renovation.",
    fitScore: 8,
    synergyScore: 6,
    financialScore: 7,
    processScore: 9,
    riskPenalty: 1,
    interactions: [
      {
        type: "Negotiation Session",
        daysAgo: 6,
        internal: "R. Sharma, Legal",
        external: "Seller counsel (fictional)",
        summary:
          "Exclusivity granted for 30 days. Agreed headline price ₹380Cr with ₹15Cr earnout tied to FY27 RevPAR. Open items: escrow (proposed 8%, seller wants 5%) and IP licence for brand.",
        sentiment: "Positive",
      },
      {
        type: "IC Session",
        daysAgo: 11,
        internal: "Investment Committee",
        external: "—",
        summary: "IC approved proceeding to binding. Sign-off delegated to closing IC once escrow and earnout terms finalised.",
        sentiment: "Positive",
      },
    ],
    actions: [
      {
        description: "Finalise escrow % and brand IP licence terms",
        owner: "Legal",
        dueOffsetDays: 2,
        priority: "High",
        status: "Open",
        workstream: "Legal",
      },
      {
        description: "Convene closing IC for final sign-off",
        owner: "R. Sharma",
        dueOffsetDays: 8,
        priority: "High",
        status: "Open",
        workstream: "Process",
      },
      {
        description: "Prepare signing checklist and announcements",
        owner: "Corp Dev Analyst",
        dueOffsetDays: 12,
        priority: "Medium",
        status: "Open",
        workstream: "Process",
      },
    ],
    valuation: { method: "EV/EBITDA + asset value", low: "₹350Cr", point: "₹380Cr", high: "₹410Cr", currency: "INR" },
    economics: { cashPct: "75%", equityPct: "20%", ev: "₹380Cr", irrBase: "18%", moicBase: "2.1x" },
    icSession: {
      daysAgo: 11,
      outcome: "Approved to binding",
      notes: "Delegated final sign-off to closing IC. Earnout capped at ₹15Cr, tied to FY27 RevPAR.",
    },
    nda: { counterparty: "Everwell Resorts & Spas", effectiveDaysAgo: 75, termMonths: 24, status: "Active" },
    sponsors: [{ name: "Mr. V. Menon (fictional)", role: "Promoter" }],
  },

  // 6 — Dropped / closed-lost
  {
    code: "DEMO-006",
    project: "Project Falcon",
    legalName: "Falcon Diagnostics Pvt Ltd (fictional)",
    vertical: "Healthcare",
    sector: "Diagnostics",
    subsector: "Pathology Chain",
    region: "South Asia",
    country: "India",
    dealOwner: "R. Sharma",
    priorityTier: "Closed",
    stage: "Dropped",
    ndaStatus: "Signed",
    commercialDd: "In Progress",
    financialDd: "Not Started",
    legalDd: "Not Started",
    rationale:
      "Regional pathology chain. Withdrew after pricing exceeded our ceiling and regulatory concerns over licensing of 2 collection centres.",
    fitScore: 6,
    synergyScore: 5,
    financialScore: 5,
    processScore: 4,
    riskPenalty: 4,
    interactions: [
      {
        type: "Withdrawal Call",
        daysAgo: 20,
        internal: "R. Sharma",
        external: "Sell-side banker (fictional)",
        summary:
          "Communicated withdrawal. Seller's asking price (~₹300Cr) ~30% above our ceiling; plus open licensing issues at 2 centres made risk/return unattractive.",
        sentiment: "Negative",
      },
    ],
    actions: [
      {
        description: "Archive data room and close out NDA",
        owner: "Legal",
        dueOffsetDays: -3,
        priority: "Low",
        status: "Open",
        workstream: "Process",
      },
    ],
    dropped: {
      category: "Pricing / Valuation Gap",
      detail: "Asking price ~30% above ceiling; compounded by unresolved licensing at 2 collection centres.",
    },
    nda: { counterparty: "Falcon Diagnostics", effectiveDaysAgo: 50, termMonths: 24, status: "Active" },
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log("Ringside Demo Data Seed");
  console.log(`  DB: ${getDatabaseUrl().replace(/:([^@]+)@/, ":***@")}`);
  console.log(`  Company: ${DEFAULT_COMPANY_ID}`);
  console.log(`  Deals: ${DEALS.length} (all synthetic, DEMO-* target codes)\n`);

  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const client = await pool.connect();

  // All writes go through the app's RLS path: set the tenant GUC, then switch
  // to the non-superuser app_rls role so company_isolation policies enforce.
  // Mirrors acquireRequestContext / withRlsTransaction in lib/db.
  await client.query(`SELECT set_config('app.company_id', $1, false)`, [DEFAULT_COMPANY_ID]);
  await client.query(`SET ROLE app_rls`);

  try {
    // ── Idempotency: remove prior DEMO-* data ────────────────────────────────
    // FK ON DELETE CASCADE is not set on all children, so delete in dependency
    // order. targets delete cascades nothing by default, so we clean children
    // first, then targets.
    log("Clearing prior DEMO-* data (idempotent re-run)…");
    const existing = await client.query(
      `SELECT id FROM targets WHERE target_code LIKE 'DEMO-%'`,
    );
    if (existing.rows.length > 0) {
      const ids = existing.rows.map((r) => r.id);
      // children in dependency order
      for (const child of [
        "ic_votes",
        "ic_cps",
        "ic_proposals",
        "advisor_conflict_notes",
        "deal_advisors",
        "regulatory_clearances",
        "nda_records",
        "deal_sponsors",
        "synergies",
        "deal_economics",
        "valuations",
        "ic_sessions",
        "stage_change_log",
        "actions",
        "interactions",
        "milestones",
        "deal_documents",
      ]) {
        await client.query(`DELETE FROM ${child} WHERE target_id = ANY($1::int[])`, [ids]);
      }
      await client.query(`DELETE FROM targets WHERE id = ANY($1::int[])`, [ids]);
      log(`  removed ${ids.length} prior DEMO target(s) and children`);
    } else {
      log("  no prior DEMO data found");
    }

    // ── Insert each deal ─────────────────────────────────────────────────────
    for (const d of DEALS) {
      const t = await client.query(
        `INSERT INTO targets (
           target_code, project_name, legal_name, business_unit, sector, subsector,
           geography_region, country, deal_owner, priority_tier, strategic_rationale,
           strategic_fit_score, synergy_score, financial_attractiveness_score,
           process_maturity_score, risk_penalty_score,
           close_reason_code, is_active, is_confidential
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true,true)
         RETURNING id`,
        [
          d.code, d.project, d.legalName, d.vertical, d.sector, d.subsector,
          d.region, d.country, d.dealOwner, d.priorityTier, d.rationale,
          d.fitScore, d.synergyScore, d.financialScore, d.processScore, d.riskPenalty,
          d.dropped ? "Withdrawn" : null,
        ],
      );
      const targetId = t.rows[0].id;

      // milestone — carries the Kanban stage
      await client.query(
        `INSERT INTO milestones (
           target_id, current_stage, stage_entered_at,
           nda_status, commercial_dd_status, financial_dd_status, legal_dd_status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          targetId, d.stage, daysAgo(Math.floor(Math.random() * 20) + 3),
          d.ndaStatus, d.commercialDd, d.financialDd, d.legalDd,
        ],
      );

      // interactions (call notes)
      for (const ix of d.interactions) {
        await client.query(
          `INSERT INTO interactions (
             target_id, interaction_type, interaction_datetime,
             participants_internal, participants_external, summary, sentiment
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [targetId, ix.type, daysAgo(ix.daysAgo), ix.internal, ix.external, ix.summary, ix.sentiment],
        );
      }

      // actions (to-dos)
      for (const a of d.actions) {
        const status = a.status;
        const completedAt = status === "Completed" ? daysAgo(1) : null;
        await client.query(
          `INSERT INTO actions (
             target_id, description, owner, due_date, priority, status, workstream, completed_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [targetId, a.description, a.owner, daysFromNow(a.dueOffsetDays), a.priority, status, a.workstream, completedAt],
        );
      }

      // valuation
      if (d.valuation) {
        await client.query(
          `INSERT INTO valuations (
             target_id, methodology, value_low, value_point, value_high, currency
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [targetId, d.valuation.method, d.valuation.low, d.valuation.point, d.valuation.high, d.valuation.currency],
        );
      }

      // deal economics
      if (d.economics) {
        await client.query(
          `INSERT INTO deal_economics (
             target_id, cash_pct, equity_pct, total_ev, irr_base, moic_base
           ) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (target_id) DO UPDATE SET
             cash_pct = EXCLUDED.cash_pct, equity_pct = EXCLUDED.equity_pct,
             total_ev = EXCLUDED.total_ev, irr_base = EXCLUDED.irr_base, moic_base = EXCLUDED.moic_base`,
          [targetId, d.economics.cashPct, d.economics.equityPct, d.economics.ev, d.economics.irrBase, d.economics.moicBase],
        );
      }

      // IC session
      if (d.icSession) {
        await client.query(
          `INSERT INTO ic_sessions (target_id, session_date, outcome, notes)
           VALUES ($1,$2,$3,$4)`,
          [targetId, daysAgo(d.icSession.daysAgo), d.icSession.outcome, d.icSession.notes],
        );
      }

      // NDA record
      if (d.nda) {
        await client.query(
          `INSERT INTO nda_records (target_id, counterparty, effective_date, term_months, status)
           VALUES ($1,$2,$3,$4,$5)`,
          [targetId, d.nda.counterparty, daysAgo(d.nda.effectiveDaysAgo), d.nda.termMonths, d.nda.status],
        );
      }

      // key sponsors
      if (d.sponsors) {
        for (const s of d.sponsors) {
          await client.query(
            `INSERT INTO deal_sponsors (target_id, name, role_title) VALUES ($1,$2,$3)`,
            [targetId, s.name, s.role],
          );
        }
      }

      // stage change log (audit trail)
      await client.query(
        `INSERT INTO stage_change_log (target_id, previous_stage, new_stage, changed_by, change_reason)
         VALUES ($1,$2,$3,$4,$5)`,
        [targetId, null, d.stage, d.dealOwner, "Seed/demo data"],
      );

      log(`✓ ${d.code} ${d.project} — ${d.vertical} / ${d.stage}`);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const counts = await client.query(
      `SELECT
         (SELECT count(*) FROM targets WHERE target_code LIKE 'DEMO-%') AS targets,
         (SELECT count(*) FROM milestones m JOIN targets t ON t.id=m.target_id WHERE t.target_code LIKE 'DEMO-%') AS milestones,
         (SELECT count(*) FROM interactions i JOIN targets t ON t.id=i.target_id WHERE t.target_code LIKE 'DEMO-%') AS interactions,
         (SELECT count(*) FROM actions a JOIN targets t ON t.id=a.target_id WHERE t.target_code LIKE 'DEMO-%') AS actions`,
    );
    const c = counts.rows[0];
    console.log(
      `\nDone. Demo data inserted: ${c.targets} targets, ${c.milestones} milestones, ${c.interactions} interactions, ${c.actions} actions.`,
    );
    console.log("All data is synthetic (DEMO-* codes). Re-run is safe — prior DEMO rows are replaced.");
  } finally {
    await client.query(`RESET ROLE`).catch(() => {});
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
