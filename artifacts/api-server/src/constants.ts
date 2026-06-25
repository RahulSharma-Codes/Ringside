// Shared pipeline constants — single source of truth for both targets and import routes

export const VALID_TIERS = new Set([
  "Must-Win",
  "Priority 1",
  "Priority 2",
  "Watchlist",
  "On Hold",
  "Dropped",
]);

export const VALID_STAGES = new Set([
  "Sourcing",
  "Outreach",
  "Introductory Discussion",
  "NDA / CIM",
  "Preliminary Due Diligence",
  "Management Meeting",
  "Non-Binding Offer",
  "Confirmatory Due Diligence",
  "Binding Offer",
  "SPA Negotiation",
  "Integration Planning",
  "NewCo Formation",
  "On Hold",
  "Rejected",
  "Closing",
  "Closed",
  "Completed",
  "Signed",
]);

// Terminal stages drive targets.isActive — must stay in sync with business rules
// "Dropped" is included: a dropped deal is closed/inactive and must not appear in active pipeline queries
export const TERMINAL_STAGES = new Set(["Rejected", "Closing", "Closed", "Completed", "Signed", "Dropped"]);

// Ordered pipeline stage list — mirrors PIPELINE_STAGE_ORDER in stage-rail.tsx
export const PIPELINE_STAGE_ORDER = [
  "Sourcing",
  "Outreach",
  "Introductory Discussion",
  "NDA / CIM",
  "Preliminary Due Diligence",
  "Management Meeting",
  "Non-Binding Offer",
  "Confirmatory Due Diligence",
  "Binding Offer",
  "SPA Negotiation",
  "Integration Planning",
  "Closing",
  "Closed",
  "Completed",
  "Signed",
];

// Deal-type-aware stage variant sets — mirrors STAGE_VARIANTS in stage-rail.tsx
const PARTNERSHIP_STAGES = [
  "Sourcing",
  "Outreach",
  "Introductory Discussion",
  "NDA / CIM",
  "Preliminary Due Diligence",
  "Management Meeting",
  "Non-Binding Offer",
  "SPA Negotiation",
  "Closing",
  "Signed",
];

export const STAGE_VARIANTS: Record<string, string[]> = {
  Acquisition: PIPELINE_STAGE_ORDER,
  "Minority Investment": PIPELINE_STAGE_ORDER,
  Divestiture: PIPELINE_STAGE_ORDER,
  JV: [
    "Sourcing",
    "Outreach",
    "Introductory Discussion",
    "NDA / CIM",
    "Preliminary Due Diligence",
    "Management Meeting",
    "Non-Binding Offer",
    "Confirmatory Due Diligence",
    "Binding Offer",
    "SPA Negotiation",
    "NewCo Formation",
    "Integration Planning",
    "Closing",
    "Closed",
    "Completed",
    "Signed",
  ],
  Partnership: PARTNERSHIP_STAGES,
  "Strategic Alliance": PARTNERSHIP_STAGES,
};

/** Return the ordered stage list for a given deal type (falls back to full list). */
export function getStagesForDealType(dealType?: string | null): string[] {
  if (!dealType) return PIPELINE_STAGE_ORDER;
  return STAGE_VARIANTS[dealType] ?? PIPELINE_STAGE_ORDER;
}
