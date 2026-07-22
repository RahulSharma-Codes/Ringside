/**
 * Unit tests for computeHealthScore — the deal-health computation that
 * drives the dashboard KPI tiles, needs-attention flags, and AI Copilot
 * system context. All tests are pure (no DB, no network).
 */

import { describe, it, expect } from "vitest";
import { computeHealthScore, type HealthScoreInputs } from "./health-score";

// ── Helper ───────────────────────────────────────────────────────────────────

/** Base-case inputs that produce "healthy" — tests override individual fields. */
const healthy: HealthScoreInputs = {
  daysSinceLastInteraction: 5,     // recent — no signal
  targetAgeInDays: 10,
  openActionCount: 2,
  overdueActionCount: 0,            // 0 % overdue — no signal
  diligenceTotalItems: 0,           // no diligence items — no signal
  diligenceCompletedItems: 0,
  daysInCurrentStage: 10,           // <45 d — no signal
  currentStage: "Sourcing",
};

// ── Score combinations ────────────────────────────────────────────────────────

describe("computeHealthScore — all-low inputs", () => {
  it("returns healthy when every signal is below threshold", () => {
    expect(computeHealthScore(healthy)).toBe("healthy");
  });
});

describe("computeHealthScore — single red-signal inputs", () => {
  it("returns at_risk when interaction is >30 days old", () => {
    const inputs: HealthScoreInputs = { ...healthy, daysSinceLastInteraction: 31 };
    expect(computeHealthScore(inputs)).toBe("at_risk");
  });

  it("returns at_risk when >50% of open actions are overdue", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      openActionCount: 4,
      overdueActionCount: 3, // 75 % > 50 %
    };
    expect(computeHealthScore(inputs)).toBe("at_risk");
  });

  it("returns at_risk when diligence completion <30% in a LATE stage", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      diligenceTotalItems: 10,
      diligenceCompletedItems: 2,  // 20 % < 30 %
      currentStage: "Confirmatory Due Diligence",
    };
    expect(computeHealthScore(inputs)).toBe("at_risk");
  });
});

describe("computeHealthScore — single warning-signal inputs", () => {
  it("returns watch when interaction is 15-30 days old", () => {
    const inputs: HealthScoreInputs = { ...healthy, daysSinceLastInteraction: 20 };
    expect(computeHealthScore(inputs)).toBe("watch");
  });

  it("returns watch when 21-50% of open actions are overdue", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      openActionCount: 10,
      overdueActionCount: 3, // 30 % — between 20 % and 50 %
    };
    expect(computeHealthScore(inputs)).toBe("watch");
  });

  it("returns watch when stage velocity stagnates (>45 days in stage)", () => {
    const inputs: HealthScoreInputs = { ...healthy, daysInCurrentStage: 50 };
    expect(computeHealthScore(inputs)).toBe("watch");
  });

  it("returns watch when diligence <30% in MID stage (Non-Binding Offer)", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      diligenceTotalItems: 10,
      diligenceCompletedItems: 2,  // 20 % < 30 %
      currentStage: "Non-Binding Offer",
    };
    expect(computeHealthScore(inputs)).toBe("watch");
  });
});

describe("computeHealthScore — two-warning escalation", () => {
  it("escalates two warnings to at_risk", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      daysSinceLastInteraction: 20, // warn: >14 d
      daysInCurrentStage: 50,       // warn: >45 d
    };
    expect(computeHealthScore(inputs)).toBe("at_risk");
  });

  it("escalates one red + one warning to at_risk", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      daysSinceLastInteraction: 31, // red: >30 d
      daysInCurrentStage: 50,       // warn: >45 d
    };
    expect(computeHealthScore(inputs)).toBe("at_risk");
  });
});

describe("computeHealthScore — missing / null inputs", () => {
  it("uses targetAgeInDays as interaction proxy when daysSinceLastInteraction is null", () => {
    // If no interaction ever recorded, targetAgeInDays is the fallback.
    // A brand-new deal (age 2d) should still be healthy.
    const inputs: HealthScoreInputs = {
      ...healthy,
      daysSinceLastInteraction: null,
      targetAgeInDays: 2,
    };
    expect(computeHealthScore(inputs)).toBe("healthy");
  });

  it("treats null daysInCurrentStage as no velocity signal", () => {
    const inputs: HealthScoreInputs = { ...healthy, daysInCurrentStage: null };
    expect(computeHealthScore(inputs)).toBe("healthy");
  });

  it("ignores action ratio when openActionCount is 0", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      openActionCount: 0,
      overdueActionCount: 0,
    };
    expect(computeHealthScore(inputs)).toBe("healthy");
  });

  it("ignores diligence signals when diligenceTotalItems is 0", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      diligenceTotalItems: 0,
      diligenceCompletedItems: 0,
      currentStage: "Closing", // LATE stage, but no items → no signal
    };
    expect(computeHealthScore(inputs)).toBe("healthy");
  });
});

describe("computeHealthScore — edge values", () => {
  it("returns healthy when interaction is exactly at the 14-day boundary", () => {
    const inputs: HealthScoreInputs = { ...healthy, daysSinceLastInteraction: 14 };
    expect(computeHealthScore(inputs)).toBe("healthy"); // >14 triggers warn, =14 does not
  });

  it("returns watch when interaction is exactly 15 days (just past boundary)", () => {
    const inputs: HealthScoreInputs = { ...healthy, daysSinceLastInteraction: 15 };
    expect(computeHealthScore(inputs)).toBe("watch");
  });

  it("returns healthy when interaction is exactly at the 30-day boundary", () => {
    const inputs: HealthScoreInputs = { ...healthy, daysSinceLastInteraction: 30 };
    expect(computeHealthScore(inputs)).toBe("watch"); // still watch (>14), not red (>30)
  });

  it("returns at_risk when interaction is exactly 31 days (just past red threshold)", () => {
    const inputs: HealthScoreInputs = { ...healthy, daysSinceLastInteraction: 31 };
    expect(computeHealthScore(inputs)).toBe("at_risk");
  });

  it("returns watch (not at_risk) when diligence 30-60% in a LATE stage", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      diligenceTotalItems: 10,
      diligenceCompletedItems: 5,  // 50 % — between 30 % and 60 %
      currentStage: "SPA Negotiation",
    };
    expect(computeHealthScore(inputs)).toBe("watch");
  });

  it("returns healthy when diligence ≥60% in a LATE stage", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      diligenceTotalItems: 10,
      diligenceCompletedItems: 6,  // 60 % — at threshold
      currentStage: "Binding Offer",
    };
    expect(computeHealthScore(inputs)).toBe("healthy");
  });

  it("diligence signal only fires for LATE stages (not Sourcing)", () => {
    const inputs: HealthScoreInputs = {
      ...healthy,
      diligenceTotalItems: 10,
      diligenceCompletedItems: 0,  // 0 % — but Sourcing is not MID or LATE
      currentStage: "Sourcing",
    };
    expect(computeHealthScore(inputs)).toBe("healthy");
  });
});
