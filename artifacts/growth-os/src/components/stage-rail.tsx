import React from "react";
import { CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

/**
 * Canonical pipeline progression order — mirrors VALID_STAGES in api-server/src/constants.ts.
 * Active funnel stages are listed in order; terminal/off-track stages are separated so they
 * can be rendered distinctly in distribution and progression views.
 */
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

export const OFF_TRACK_STAGES = ["On Hold", "Dropped", "Rejected"];

/** All known stages — for display fallback if a stage appears outside the ordered list */
export const ALL_KNOWN_STAGES = [...PIPELINE_STAGE_ORDER, ...OFF_TRACK_STAGES];

/**
 * Deal-type-aware stage variants.
 * Acquisition / Minority Investment / Divestiture / null → full default set.
 * JV → default + "NewCo Formation" inserted between SPA Negotiation and Integration Planning.
 * Partnership / Strategic Alliance → lighter path (no Conf-DD, no Binding Offer, no Integration).
 */
export const STAGE_VARIANTS: Record<string, string[]> = {
  "Acquisition": PIPELINE_STAGE_ORDER,
  "Minority Investment": PIPELINE_STAGE_ORDER,
  "Divestiture": PIPELINE_STAGE_ORDER,
  "JV": [
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
  "Partnership": [
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
  ],
  "Strategic Alliance": [
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
  ],
};

/** Return the ordered stage list for a given deal type (falls back to full list). */
export function getStagesForDealType(dealType?: string | null): string[] {
  if (!dealType) return PIPELINE_STAGE_ORDER;
  return STAGE_VARIANTS[dealType] ?? PIPELINE_STAGE_ORDER;
}

/**
 * Whether changing deal type from `fromType` to `toType` would leave the deal
 * stranded in a stage that doesn't exist in the new variant set.
 */
export function isDealTypeChangeSafe(
  currentStage: string,
  fromType: string | null | undefined,
  toType: string | null | undefined,
): boolean {
  const newStages = getStagesForDealType(toType);
  if (OFF_TRACK_STAGES.includes(currentStage)) return true;
  return newStages.includes(currentStage);
}

function shortStageName(stage: string): string {
  const abbrev: Record<string, string> = {
    "Introductory Discussion": "Intro",
    "Preliminary Due Diligence": "Pre-DD",
    "Management Meeting": "Mgmt Mtg",
    "Non-Binding Offer": "NBO",
    "Confirmatory Due Diligence": "Conf-DD",
    "SPA Negotiation": "SPA Neg.",
    "Integration Planning": "Integration",
  };
  return abbrev[stage] ?? stage;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface StageDistributionItem {
  stage: string;
  count: number;
  hasFlagged?: boolean;
}

interface StageRailDistributionProps {
  mode: "distribution";
  stages: StageDistributionItem[];
  totalActive: number;
  onStageClick?: (stage: string) => void;
}

interface StageRailProgressionProps {
  mode: "progression";
  currentStage: string;
  daysInStage?: number;
  /** Deal type — used to filter stages to only those applicable for this deal type */
  dealType?: string | null;
  /** When provided, stages become selectable (used in Change Stage modal) */
  onSelectStage?: (stage: string) => void;
  /** The currently selected stage (for modal stepper mode) */
  selectedStage?: string;
}

type StageRailProps = StageRailDistributionProps | StageRailProgressionProps;

// ── Public component ───────────────────────────────────────────────────────

export function StageRail(props: StageRailProps) {
  if (props.mode === "distribution") {
    return <DistributionRail {...props} />;
  }
  return <ProgressionRail {...props} />;
}

// ── Distribution board ─────────────────────────────────────────────────────

function DistributionRail({ stages, totalActive, onStageClick }: StageRailDistributionProps) {
  const countByStage = new Map(stages.map((s) => [s.stage, s.count]));
  const flaggedByStage = new Map(stages.map((s) => [s.stage, s.hasFlagged ?? false]));

  const extraStages = stages
    .filter((s) => !PIPELINE_STAGE_ORDER.includes(s.stage) && s.count > 0)
    .map((s) => s.stage);

  const displayStages = [...PIPELINE_STAGE_ORDER, ...extraStages];
  const maxCount = Math.max(...displayStages.map((s) => countByStage.get(s) ?? 0), 1);

  return (
    <div className="overflow-x-auto pb-1 -mx-1 px-1">
      <div className="flex items-stretch gap-0 min-w-max">
        {displayStages.map((stage, idx) => {
          const count = countByStage.get(stage) ?? 0;
          const hasFlagged = flaggedByStage.get(stage) ?? false;
          const pct = totalActive > 0 && count > 0 ? Math.round((count / totalActive) * 100) : 0;
          const barHeight = count > 0 ? Math.max(8, Math.round((count / maxCount) * 48)) : 4;
          const isLast = idx === displayStages.length - 1;

          const isClickable = !!onStageClick;
          return (
            <div key={stage} className="flex items-stretch">
              <div
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={isClickable ? () => onStageClick(stage) : undefined}
                onKeyDown={isClickable ? (e) => (e.key === "Enter" || e.key === " ") && onStageClick(stage) : undefined}
                className={`group/stage-card flex flex-col items-center px-3 py-2.5 rounded-xl border transition-colors min-w-[86px]${isClickable ? " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" : ""} ${
                  count > 0
                    ? hasFlagged
                      ? `bg-destructive/5 border-destructive/20${isClickable ? " cursor-pointer hover:bg-destructive/10 hover:border-destructive/40 hover:shadow-sm" : ""}`
                      : `bg-card border-border/70${isClickable ? " cursor-pointer hover:bg-muted/30 hover:border-border hover:shadow-sm" : ""}`
                    : `bg-muted/20 border-border/30 opacity-40${isClickable ? " cursor-pointer hover:opacity-70" : ""}`
                }`}
              >
                {hasFlagged && count > 0 && (
                  <AlertTriangle size={9} className="text-destructive mb-1 shrink-0" />
                )}
                <div
                  className={`w-full rounded-sm mb-2 transition-all ${
                    hasFlagged && count > 0
                      ? "bg-destructive/40"
                      : count > 0
                      ? "bg-primary/50"
                      : "bg-muted/30"
                  }`}
                  style={{ height: `${barHeight}px` }}
                />
                <div
                  className={`font-mono font-bold text-base leading-none mb-0.5 ${
                    count > 0
                      ? hasFlagged
                        ? "text-destructive"
                        : "text-foreground"
                      : "text-muted-foreground/30"
                  }`}
                >
                  {count}
                </div>
                {pct > 0 && (
                  <div className="font-mono text-[9px] text-muted-foreground/60 mb-1">{pct}%</div>
                )}
                <div className="text-[9px] font-mono text-muted-foreground/70 uppercase tracking-wide text-center leading-tight mt-auto">
                  {shortStageName(stage)}
                </div>
                {isClickable && count > 0 && (
                  <div className="mt-1.5 opacity-0 group-hover/stage-card:opacity-100 transition-opacity flex items-center gap-0.5 text-primary/70">
                    <span className="text-[8px] font-mono uppercase tracking-wide">View</span>
                    <ArrowRight size={8} />
                  </div>
                )}
              </div>
              {!isLast && (
                <div className="flex items-center px-0.5 shrink-0">
                  <div className="w-3 h-px bg-border/50" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Progression rail ───────────────────────────────────────────────────────

type StageStatus = "completed" | "current" | "future" | "offtrack";

function getProgressionStatus(stageName: string, currentStage: string, stageList: string[]): StageStatus {
  if (OFF_TRACK_STAGES.includes(currentStage)) {
    return stageName === currentStage ? "current" : "offtrack";
  }
  const currentIdx = stageList.indexOf(currentStage);
  const stageIdx = stageList.indexOf(stageName);
  if (currentIdx === -1) return "future";
  if (stageIdx < currentIdx) return "completed";
  if (stageIdx === currentIdx) return "current";
  return "future";
}

function ProgressionRail({
  currentStage,
  daysInStage,
  dealType,
  onSelectStage,
  selectedStage,
}: StageRailProgressionProps) {
  const isSelectable = !!onSelectStage;
  const isOffTrack = OFF_TRACK_STAGES.includes(currentStage);
  const baseStages = getStagesForDealType(dealType);

  const stagesToShow = isOffTrack
    ? [...baseStages, currentStage]
    : baseStages;

  return (
    <div className="overflow-x-auto pb-1 -mx-1 px-1">
      <div className="flex items-center gap-0 min-w-max">
        {stagesToShow.map((stage, idx) => {
          const status = getProgressionStatus(stage, currentStage, stagesToShow);
          const isSelected = selectedStage === stage;
          const isCurrentStage = stage === currentStage;
          const canSelect = isSelectable && !isCurrentStage;
          const isLast = idx === stagesToShow.length - 1;

          return (
            <div key={stage} className="flex items-center">
              <button
                type="button"
                disabled={!canSelect}
                onClick={() => canSelect && onSelectStage?.(stage)}
                className={[
                  "relative flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border transition-all duration-150 min-w-[72px] text-center",
                  canSelect ? "cursor-pointer" : "cursor-default",
                  isSelected
                    ? "bg-primary/20 border-primary text-primary shadow-sm"
                    : status === "current"
                    ? "bg-primary/10 border-primary/50 text-primary"
                    : status === "completed"
                    ? "bg-transparent border-border/30 text-muted-foreground/50"
                    : status === "offtrack"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                    : "bg-transparent border-border/20 text-muted-foreground/30",
                  canSelect && !isSelected
                    ? "hover:bg-muted/40 hover:border-border hover:text-muted-foreground"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="flex items-center gap-1">
                  {status === "completed" && (
                    <CheckCircle2 size={9} className="text-muted-foreground/40 shrink-0" />
                  )}
                  {(status === "current" || isSelected) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                  )}
                  <span
                    className={`text-[9px] font-mono uppercase tracking-wide leading-tight ${
                      isSelected || status === "current" ? "font-semibold" : ""
                    }`}
                  >
                    {shortStageName(stage)}
                  </span>
                </div>
                {status === "current" && daysInStage !== undefined && !isSelectable && (
                  <span className="text-[8px] font-mono text-primary/70">{daysInStage}d</span>
                )}
              </button>
              {!isLast && (
                <div
                  className={`w-3 h-px shrink-0 ${
                    status === "completed" ? "bg-border/50" : "bg-border/20"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
