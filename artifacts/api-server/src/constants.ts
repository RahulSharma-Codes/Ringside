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
  "On Hold",
  "Rejected",
  "Closing",
  "Closed",
  "Completed",
  "Signed",
]);

// Terminal stages drive targets.isActive — must stay in sync with business rules
export const TERMINAL_STAGES = new Set(["Rejected", "Closing", "Closed", "Completed", "Signed"]);
