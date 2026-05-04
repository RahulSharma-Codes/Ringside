import { PIPELINE_STAGE_ORDER } from "@/components/stage-rail";

export const SCORE_DEFAULTS = {
  strategicFitScore: 50,
  synergyScore: 50,
  financialAttractivenessScore: 50,
  processMaturityScore: 50,
  riskPenaltyScore: 0,
} as const;

export type ScoreField = keyof typeof SCORE_DEFAULTS;

const SCORE_LABELS: Record<ScoreField, string> = {
  strategicFitScore: "Strategic Fit",
  synergyScore: "Synergy Potential",
  financialAttractivenessScore: "Financial Attractiveness",
  processMaturityScore: "Process Maturity",
  riskPenaltyScore: "Risk Penalty",
};

export function getScoreLabel(field: ScoreField): string {
  return SCORE_LABELS[field];
}

function stageIndex(stage: string | null | undefined): number {
  if (!stage) return -1;
  return PIPELINE_STAGE_ORDER.indexOf(stage);
}

const NBO_INDEX = PIPELINE_STAGE_ORDER.indexOf("Non-Binding Offer");
const SPA_INDEX = PIPELINE_STAGE_ORDER.indexOf("SPA Negotiation");

function isEarlyStage(stage: string | null | undefined): boolean {
  const idx = stageIndex(stage);
  return idx >= 0 && idx < NBO_INDEX;
}

export function isAssessedScore(
  value: number | null | undefined,
  field: ScoreField,
  stage: string | null | undefined,
): boolean {
  if (value === null || value === undefined) return false;
  if (isEarlyStage(stage) && value === SCORE_DEFAULTS[field]) return false;
  return true;
}

export function formatScore(
  value: number | null | undefined,
  field: ScoreField,
  stage: string | null | undefined,
): string {
  if (!isAssessedScore(value, field, stage)) return "Not assessed";
  return String(value);
}

export type ConfidenceLevel = "Early indication" | "Under review" | "Diligence-backed";

export function getScoreConfidence(stage: string | null | undefined): ConfidenceLevel {
  const idx = stageIndex(stage);
  if (idx < 0) return "Early indication";
  if (idx >= SPA_INDEX) return "Diligence-backed";
  if (idx >= NBO_INDEX) return "Under review";
  return "Early indication";
}

export type ScoreTarget = {
  strategicFitScore?: number | null;
  synergyScore?: number | null;
  financialAttractivenessScore?: number | null;
  processMaturityScore?: number | null;
  riskPenaltyScore?: number | null;
  currentStage?: string | null;
};

export function countAssessedScores(target: ScoreTarget): number {
  const stage = target.currentStage;
  const fields: ScoreField[] = [
    "strategicFitScore",
    "synergyScore",
    "financialAttractivenessScore",
    "processMaturityScore",
    "riskPenaltyScore",
  ];
  return fields.filter((f) => isAssessedScore(target[f], f, stage)).length;
}

export type ScoredTarget = ScoreTarget & { priorityScore?: number | null };

/**
 * Averages the composite priority score only for targets that have at least
 * one genuinely assessed score field, skipping pure default-filler deals.
 */
export function computeAvgAssessedScore(targets: ScoredTarget[]): number | null {
  const scores: number[] = [];
  for (const t of targets) {
    if (countAssessedScores(t) > 0 && t.priorityScore != null) {
      scores.push(t.priorityScore);
    }
  }
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
