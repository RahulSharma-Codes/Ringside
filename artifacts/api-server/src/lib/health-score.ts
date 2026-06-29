export type HealthScore = "healthy" | "watch" | "at_risk";

export interface HealthScoreInputs {
  daysSinceLastInteraction: number | null;
  targetAgeInDays: number;
  openActionCount: number;
  overdueActionCount: number;
  diligenceTotalItems: number;
  diligenceCompletedItems: number;
  daysInCurrentStage: number | null;
  currentStage: string;
}

// MID: non-binding/early negotiation — some diligence expected
const MID_STAGES = new Set(["Non-Binding Offer"]);
// LATE: binding stage onwards — substantial diligence expected
const LATE_STAGES = new Set([
  "Confirmatory Due Diligence",
  "Binding Offer",
  "SPA Negotiation",
  "Integration Planning",
  "Closing",
  "Closed",
  "Completed",
  "Signed",
]);

export function computeHealthScore(inputs: HealthScoreInputs): HealthScore {
  const {
    daysSinceLastInteraction, targetAgeInDays,
    openActionCount, overdueActionCount,
    diligenceTotalItems, diligenceCompletedItems,
    daysInCurrentStage, currentStage,
  } = inputs;

  let red = 0;
  let warn = 0;

  // Signal 1: Momentum — days since last interaction (>14d warn, >30d red)
  const interactionAge = daysSinceLastInteraction ?? targetAgeInDays;
  if (interactionAge > 30) red++;
  else if (interactionAge > 14) warn++;

  // Signal 2: Action health — overdue / total open ratio (>20% warn, >50% red)
  if (openActionCount > 0) {
    const ratio = overdueActionCount / openActionCount;
    if (ratio > 0.5) red++;
    else if (ratio > 0.2) warn++;
  }

  // Signal 3: Diligence progress vs stage expectations
  if (diligenceTotalItems > 0) {
    const pct = diligenceCompletedItems / diligenceTotalItems;
    if (LATE_STAGES.has(currentStage)) {
      if (pct < 0.3) red++;
      else if (pct < 0.6) warn++;
    } else if (MID_STAGES.has(currentStage)) {
      if (pct < 0.3) warn++;
    }
  }

  // Signal 4: Stage velocity — stagnation threshold at 45 days
  if (daysInCurrentStage !== null && daysInCurrentStage > 45) warn++;

  // Aggregate: any red OR ≥2 warnings = At Risk; ≥1 warning = Watch; else Healthy
  if (red > 0 || warn >= 2) return "at_risk";
  if (warn >= 1) return "watch";
  return "healthy";
}
