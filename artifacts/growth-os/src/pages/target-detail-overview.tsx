import React from "react";
import { useListActions, getListActionsQueryKey } from "@workspace/api-client-react";
import { downloadAuthenticatedFile } from "@/lib/download";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { LinkifiedText } from "@/components/linkified-text";
import { ALL_KNOWN_STAGES } from "@/components/stage-rail";
import {
  formatScore,
  getScoreConfidence,
  countAssessedScores,
  type ScoreField,
} from "@/lib/score-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OverviewTarget = {
  currentStage?: string | null;
  projectName?: string | null;
  targetCode?: string | null;
  legalName?: string | null;
  sector?: string | null;
  subsector?: string | null;
  country?: string | null;
  geographyRegion?: string | null;
  dealOwner?: string | null;
  dealChampion?: string | null;
  executiveSponsor?: string | null;
  priorityTier?: string | null;
  strategicRationale?: string | null;
  businessUnit?: string | null;
  createdAt?: string | null;
  priorityScore: number;
  strategicFitScore?: number | null;
  synergyScore?: number | null;
  financialAttractivenessScore?: number | null;
  processMaturityScore?: number | null;
  riskPenaltyScore?: number | null;
  sourcingChannel?: string | null;
  dealType?: string | null;
  closeReasonCode?: string | null;
  phase1VerdictAccuracy?: string | null;
  phase1VerdictNote?: string | null;
  closeMissTheme?: string | null;
};

export type OverviewAction = {
  id: number;
  description: string;
  status: string;
  dueDate?: string | null;
  owner?: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SCREENING_STAGE = "NDA / CIM";
const DILIGENCE_STAGE = "Preliminary Due Diligence";
const OFFER_STAGE = "Binding Offer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function stageReached(current: string | null | undefined, gate: string): boolean {
  const currentIdx = ALL_KNOWN_STAGES.indexOf(current ?? "");
  const gateIdx = ALL_KNOWN_STAGES.indexOf(gate);
  if (currentIdx < 0 || gateIdx < 0) return false;
  return currentIdx >= gateIdx;
}

function getScoreColor(score: number) {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-primary";
  if (score >= 40) return "text-amber-500";
  return "text-destructive";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OverviewSectionHeader({
  label,
  badge,
  always,
}: {
  label: string;
  badge?: React.ReactNode;
  always?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 font-semibold">{label}</div>
      {always && (
        <div className="text-[9px] font-mono uppercase tracking-wide text-muted-foreground/40 border border-border/30 px-1.5 py-0.5 rounded">Always</div>
      )}
      {badge}
    </div>
  );
}

function ConfidenceBadge({ stage }: { stage: string | null | undefined }) {
  const level = getScoreConfidence(stage);
  const cls =
    level === "Diligence-backed"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25"
      : level === "Under review"
      ? "bg-primary/10 text-primary border-primary/25"
      : "bg-muted/50 text-muted-foreground border-border/50";
  return (
    <Badge variant="outline" className={`font-mono text-[9px] uppercase ${cls}`}>
      {level}
    </Badge>
  );
}

function ScoreRow({
  label,
  value,
  field,
  stage,
  isRisk,
  showConfidence,
}: {
  label: string;
  value: number | null | undefined;
  field: ScoreField;
  stage: string | null | undefined;
  isRisk?: boolean;
  showConfidence?: boolean;
}) {
  const display = formatScore(value, field, stage);
  const isAssessed = display !== "Not assessed";
  const confidence = getScoreConfidence(stage);
  const confidenceCls =
    confidence === "Diligence-backed"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25"
      : confidence === "Under review"
      ? "bg-primary/10 text-primary border-primary/25"
      : "bg-muted/50 text-muted-foreground/60 border-border/40";

  return (
    <div className={`p-3 flex items-center justify-between text-sm gap-2 ${isRisk ? "bg-destructive/5" : ""}`}>
      <span className={isRisk ? "text-destructive" : "text-muted-foreground"}>{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        {showConfidence && (
          <span className={`font-mono text-[8px] uppercase tracking-wide border px-1.5 py-0.5 rounded ${confidenceCls}`}>
            {confidence}
          </span>
        )}
        {isAssessed ? (
          <span className={`font-mono font-medium ${isRisk ? "text-destructive" : ""}`}>
            {isRisk ? `-${display}` : `${display}/100`}
          </span>
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground/50 italic">Not assessed</span>
        )}
      </div>
    </div>
  );
}

function OverviewSections({ target, actions }: { target: OverviewTarget; actions: OverviewAction[] }) {
  const stage = target.currentStage;
  const showScreening = stageReached(stage, SCREENING_STAGE);
  const showDiligence = stageReached(stage, DILIGENCE_STAGE);
  const showOffer = stageReached(stage, OFFER_STAGE);

  const nextAction = actions.find((a) => a.status !== "Completed");
  const assessedCount = countAssessedScores({
    strategicFitScore: target.strategicFitScore,
    synergyScore: target.synergyScore,
    financialAttractivenessScore: target.financialAttractivenessScore,
    processMaturityScore: target.processMaturityScore,
    riskPenaltyScore: target.riskPenaltyScore,
    currentStage: stage,
  });

  return (
    <div className="space-y-6">
      {/* ── Section 1: Teaser / Origination Snapshot (always visible) ── */}
      <div className="space-y-2">
        <OverviewSectionHeader label="Teaser / Origination Snapshot" always />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2 bg-card/40 border-border/70 rounded-xl">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Strategic Rationale</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {target.strategicRationale ? (
                  <LinkifiedText text={target.strategicRationale} />
                ) : (
                  <span className="text-muted-foreground italic">No strategic rationale recorded.</span>
                )}
              </p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="bg-card/40 border-border/70 rounded-xl">
              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-1 gap-y-3">
                  {[
                    { label: "Project Name", value: target.projectName },
                    { label: "Target Code", value: target.targetCode },
                    { label: "Legal Name", value: target.legalName },
                    { label: "Deal Type", value: target.dealType },
                    { label: "Sector", value: [target.sector, target.subsector].filter(Boolean).join(" › ") || null },
                    { label: "Geography", value: [target.country, target.geographyRegion].filter(Boolean).join(" / ") || null },
                    { label: "Sourcing Channel", value: target.sourcingChannel },
                    { label: "Priority Tier", value: target.priorityTier },
                    { label: "Deal Owner", value: target.dealOwner },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider mb-0.5">{label}</div>
                      <div className="text-sm font-medium">{value || "—"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {nextAction && (
              <Card className="bg-primary/5 border-primary/20 rounded-xl">
                <CardContent className="pt-3 pb-3 px-4">
                  <div className="text-[9px] font-mono text-primary/70 uppercase tracking-wider mb-1">Next Action</div>
                  <div className="text-sm font-medium leading-snug truncate">{nextAction.description}</div>
                  {nextAction.dueDate && (
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      Due {format(parseISO(nextAction.dueDate), "MMM d, yyyy")}
                    </div>
                  )}
                  {nextAction.owner && (
                    <div className="text-[10px] font-mono text-muted-foreground">{nextAction.owner}</div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 2: Screening View (NDA / CIM onward) ── */}
      {showScreening && (
        <div className="space-y-2">
          <OverviewSectionHeader label="Screening View" />
          <Card className="bg-card/40 border-border/70 rounded-xl">
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                {[
                  { label: "Deal Champion", value: target.dealChampion },
                  { label: "Exec Sponsor", value: target.executiveSponsor },
                  { label: "Business Unit", value: target.businessUnit },
                  { label: "Added", value: target.createdAt ? format(parseISO(target.createdAt), "yyyy-MM-dd") : null },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">{label}</div>
                    <div className="text-sm font-medium">{value || "—"}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Section 3: Diligence Assessment (Preliminary Due Diligence onward) ── */}
      {showDiligence && (
        <div className="space-y-2">
          <OverviewSectionHeader label="Diligence Assessment" badge={<ConfidenceBadge stage={stage} />} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/40 border-border/70 rounded-xl overflow-hidden md:col-span-2">
              <div className="bg-muted/40 p-4 border-b border-border/60 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Composite Score</div>
                  <div className="flex items-center gap-2">
                    <ConfidenceBadge stage={stage} />
                    <span className="text-[10px] font-mono text-muted-foreground/60">{assessedCount}/5 scores assessed</span>
                  </div>
                </div>
                <div className={`text-3xl font-mono font-bold ${getScoreColor(target.priorityScore)}`}>
                  {Math.round(target.priorityScore)}
                </div>
              </div>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  <ScoreRow label="Strategic Fit" value={target.strategicFitScore} field="strategicFitScore" stage={stage} showConfidence />
                  <ScoreRow label="Synergy Potential" value={target.synergyScore} field="synergyScore" stage={stage} showConfidence />
                  <ScoreRow label="Financial Attractiveness" value={target.financialAttractivenessScore} field="financialAttractivenessScore" stage={stage} showConfidence />
                  <ScoreRow label="Process Maturity" value={target.processMaturityScore} field="processMaturityScore" stage={stage} showConfidence />
                  <ScoreRow label="Risk Penalty" value={target.riskPenaltyScore} field="riskPenaltyScore" stage={stage} isRisk showConfidence />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/40 border-border/70 rounded-xl flex flex-col justify-center">
              <CardContent className="pt-6 pb-6 flex flex-col items-center justify-center gap-2 text-center">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Assessment Completeness</div>
                <div className={`text-4xl font-bold font-mono ${assessedCount === 5 ? "text-emerald-500" : assessedCount >= 3 ? "text-primary" : "text-muted-foreground"}`}>
                  {assessedCount}/5
                </div>
                <div className="w-full bg-muted/40 rounded-full h-1.5 mt-1">
                  <div
                    className={`h-1.5 rounded-full transition-all ${assessedCount === 5 ? "bg-emerald-500" : "bg-primary"}`}
                    style={{ width: `${(assessedCount / 5) * 100}%` }}
                  />
                </div>
                <div className="text-[10px] font-mono text-muted-foreground/60">
                  {assessedCount === 5
                    ? "All scores assessed"
                    : assessedCount === 0
                    ? "No scores assessed yet"
                    : `${5 - assessedCount} score${5 - assessedCount > 1 ? "s" : ""} pending`}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Section 4: Offer / Integration Readiness (Binding Offer onward) ── */}
      {showOffer && (
        <div className="space-y-2">
          <OverviewSectionHeader label="Offer / Integration Readiness" />
          <Card className="bg-card/40 border-border/70 rounded-xl">
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-mono text-muted-foreground/70">
                Deal has progressed to offer stage. Document key offer and integration milestones in the
                Diligence tab and track actions below.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Section 5: Deal Verdict (Closed / Dropped only) ── */}
      {(stage === "Closed" || stage === "Dropped") && (
        <div className="space-y-2">
          <OverviewSectionHeader label="Deal Verdict" />
          <Card className="bg-card/40 border-border/70 rounded-xl overflow-hidden">
            <div
              className={`px-4 py-3 border-b border-border/60 flex items-center gap-3 ${
                target.phase1VerdictAccuracy === "Correct"
                  ? "bg-emerald-500/10"
                  : target.phase1VerdictAccuracy === "Partially-correct"
                  ? "bg-amber-500/10"
                  : target.phase1VerdictAccuracy === "Wrong"
                  ? "bg-destructive/10"
                  : "bg-muted/30"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider mb-0.5">
                  Phase 1 Screen Accuracy
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {target.phase1VerdictAccuracy ? (
                    <span
                      className={`status-chip font-mono text-[11px] ${
                        target.phase1VerdictAccuracy === "Correct"
                          ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                          : target.phase1VerdictAccuracy === "Partially-correct"
                          ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                          : "bg-destructive/15 text-destructive border-destructive/30"
                      }`}
                    >
                      {target.phase1VerdictAccuracy}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Not recorded</span>
                  )}
                  {target.closeMissTheme && (
                    <span className="metadata-label text-muted-foreground/70">{target.closeMissTheme}</span>
                  )}
                </div>
              </div>
              {target.closeReasonCode && (
                <div className="text-right shrink-0">
                  <div className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider mb-0.5">Close Reason</div>
                  <div className="text-sm font-medium font-mono">{target.closeReasonCode}</div>
                </div>
              )}
            </div>
            {target.phase1VerdictNote && (
              <CardContent className="pt-3 pb-3">
                <div className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider mb-1">Accuracy Note</div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{target.phase1VerdictNote}</p>
              </CardContent>
            )}
            {!target.phase1VerdictAccuracy && !target.closeReasonCode && (
              <CardContent className="pt-3 pb-3">
                <p className="text-[11px] font-mono text-muted-foreground/50 italic">
                  No verdict recorded — the deal was closed or dropped without a Phase 1 assessment.
                </p>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* Scores section for early-stage targets */}
      {!showDiligence && (
        <div className="space-y-2">
          <OverviewSectionHeader label="Score Card (Early Stage)" />
          <Collapsible>
            <Card className="bg-card/40 border-border/70 rounded-xl overflow-hidden">
              <CollapsibleTrigger asChild>
                <div className="bg-muted/30 px-4 py-3 border-b border-border/60 flex items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Score Card</div>
                    <ConfidenceBadge stage={stage} />
                    <span className="text-[10px] font-mono text-muted-foreground/50">{assessedCount}/5 assessed</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-2xl font-mono font-bold ${getScoreColor(target.priorityScore)}`}>
                      {Math.round(target.priorityScore)}
                    </div>
                    <ChevronDown size={14} className="text-muted-foreground" />
                  </div>
                </div>
              </CollapsibleTrigger>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  <ScoreRow label="Strategic Fit" value={target.strategicFitScore} field="strategicFitScore" stage={stage} showConfidence />
                  <ScoreRow label="Synergy Potential" value={target.synergyScore} field="synergyScore" stage={stage} showConfidence />
                  <ScoreRow label="Financial Attractiveness" value={target.financialAttractivenessScore} field="financialAttractivenessScore" stage={stage} showConfidence />
                  <ScoreRow label="Process Maturity" value={target.processMaturityScore} field="processMaturityScore" stage={stage} showConfidence />
                  <ScoreRow label="Risk Penalty" value={target.riskPenaltyScore} field="riskPenaltyScore" stage={stage} isRisk showConfidence />
                </div>
              </CardContent>
            </Card>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

// ── Public Tab Component ──────────────────────────────────────────────────────

interface OverviewTabProps {
  targetId: number;
  target: OverviewTarget;
}

export function OverviewTab({ targetId, target }: OverviewTabProps) {
  const { data: actions = [] } = useListActions(targetId, {
    query: { enabled: !!targetId, queryKey: getListActionsQueryKey(targetId) },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="rounded-sm font-mono text-[10px] uppercase border-border/60 h-7 px-2.5 gap-1.5"
          onClick={() => {
            downloadAuthenticatedFile(
              `/api/export/memo/${targetId}`,
              `deal-memo-${targetId}.pdf`,
            ).catch(() => {});
          }}
        >
          <Download size={11} /> Export Memo
        </Button>
      </div>
      <OverviewSections target={target} actions={actions} />
    </div>
  );
}
