import React from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, User, Zap } from "lucide-react";
import { StageChip } from "@/components/stage-chip";
import { PIPELINE_STAGE_ORDER, OFF_TRACK_STAGES } from "@/components/stage-rail";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KanbanTarget {
  id: number;
  projectName?: string | null;
  targetCode?: string | null;
  currentStage?: string | null;
  priorityTier?: string | null;
  priorityScore?: number | null;
  dealOwner?: string | null;
  needsAttention?: boolean | null;
  openActionCount?: number | null;
  overdueActionCount?: number | null;
}

interface PipelineKanbanProps {
  targets: KanbanTarget[];
  aiMode?: string | null;
  /** Active stage filter value — "all" or a specific stage name */
  stageFilter?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTierBadgeColor(tier: string | null | undefined): string {
  switch (tier) {
    case "Must-Win":   return "bg-destructive text-destructive-foreground border-0";
    case "Priority 1": return "bg-amber-500 text-white border-0";
    case "Priority 2": return "bg-primary text-primary-foreground border-0";
    case "Watchlist":  return "bg-muted text-muted-foreground border-border";
    default:           return "bg-secondary text-secondary-foreground border-0";
  }
}

function getTierCardAccent(tier: string | null | undefined): string {
  switch (tier) {
    case "Must-Win":   return "border-l-destructive/50";
    case "Priority 1": return "border-l-amber-500/50";
    case "Priority 2": return "border-l-primary/50";
    default:           return "border-l-border/40";
  }
}

// ── Deal Card ─────────────────────────────────────────────────────────────────

function DealCard({ target, href }: { target: KanbanTarget; href: string }) {
  const overdueCount = target.overdueActionCount ?? 0;
  const openCount = target.openActionCount ?? 0;

  return (
    <Link href={href}>
      <div
        className={`group bg-card border border-border/70 border-l-2 ${getTierCardAccent(target.priorityTier)} rounded-lg p-3 hover:shadow-md hover:border-border transition-all duration-150 cursor-pointer space-y-2`}
      >
        {/* Name + attention flag */}
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold leading-snug truncate group-hover:text-primary transition-colors">
              {target.projectName ?? "Untitled"}
            </div>
            <div className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider mt-0.5">
              {target.targetCode}
            </div>
          </div>
          {target.needsAttention && (
            <AlertTriangle size={11} className="text-destructive shrink-0 mt-0.5" />
          )}
        </div>

        {/* Tier badge + score */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge className={`font-mono text-[9px] uppercase rounded-sm px-1.5 py-0 h-4 ${getTierBadgeColor(target.priorityTier)}`}>
            {target.priorityTier ?? "—"}
          </Badge>
          {target.priorityScore != null && (
            <span className="text-[9px] font-mono text-muted-foreground/60 flex items-center gap-0.5">
              <Zap size={8} className="text-primary/50" />
              {Math.round(target.priorityScore)}
            </span>
          )}
        </div>

        {/* Owner + open actions */}
        <div className="flex items-center justify-between gap-1.5">
          {target.dealOwner ? (
            <span className="text-[9px] font-mono text-muted-foreground/60 flex items-center gap-0.5 min-w-0 truncate">
              <User size={8} className="shrink-0" />
              <span className="truncate">{target.dealOwner}</span>
            </span>
          ) : (
            <span />
          )}
          {openCount > 0 && (
            <span className={`text-[9px] font-mono shrink-0 ${overdueCount > 0 ? "text-destructive" : "text-amber-500"}`}>
              {openCount} action{openCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  targets,
  aiMode,
  isOffTrack = false,
}: {
  stage: string;
  targets: KanbanTarget[];
  aiMode?: string | null;
  isOffTrack?: boolean;
}) {
  const count = targets.length;

  return (
    <div className="flex flex-col shrink-0 w-[220px]">
      {/* Column header */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-t-lg border border-b-0 ${
          isOffTrack
            ? "bg-amber-500/5 border-amber-500/20"
            : "bg-muted/30 border-border/50"
        }`}
      >
        <span
          className={`text-[9px] font-mono uppercase tracking-wider font-semibold truncate ${
            isOffTrack ? "text-amber-500/80" : "text-muted-foreground"
          }`}
        >
          {stage}
        </span>
        <span
          className={`text-[10px] font-mono font-bold shrink-0 ${
            count > 0
              ? isOffTrack
                ? "text-amber-500"
                : "text-foreground"
              : "text-muted-foreground/30"
          }`}
        >
          {count}
        </span>
      </div>

      {/* Card stack */}
      <div
        className={`flex-1 rounded-b-lg border border-t-0 p-2 space-y-2 min-h-[120px] ${
          isOffTrack ? "border-amber-500/20 bg-amber-500/3" : "border-border/50 bg-muted/10"
        }`}
      >
        {count === 0 ? (
          <div className="flex items-center justify-center h-[80px]">
            <span className="text-[9px] font-mono text-muted-foreground/30 uppercase tracking-widest">
              0 deals
            </span>
          </div>
        ) : (
          targets.map((t) => {
            const href = aiMode ? `/targets/${t.id}?ai=${aiMode}` : `/targets/${t.id}`;
            return <DealCard key={t.id} target={t} href={href} />;
          })
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function PipelineKanban({ targets, aiMode, stageFilter }: PipelineKanbanProps) {
  // Group targets by stage
  const byStage = new Map<string, KanbanTarget[]>();
  for (const stage of PIPELINE_STAGE_ORDER) {
    byStage.set(stage, []);
  }
  const offTrackTargets: KanbanTarget[] = [];

  for (const t of targets) {
    const stage = t.currentStage ?? "Sourcing";
    if (OFF_TRACK_STAGES.includes(stage)) {
      offTrackTargets.push(t);
    } else if (byStage.has(stage)) {
      byStage.get(stage)!.push(t);
    } else {
      offTrackTargets.push(t);
    }
  }

  // When a specific stage is filtered, collapse to just that column (+ off-track
  // if the filter is an off-track stage, or omit off-track for pipeline stages).
  const isOffTrackFilter = stageFilter && OFF_TRACK_STAGES.includes(stageFilter);
  const activeStagesToShow =
    stageFilter && stageFilter !== "all"
      ? isOffTrackFilter
        ? [] // show only off-track column
        : PIPELINE_STAGE_ORDER.filter((s) => s === stageFilter)
      : PIPELINE_STAGE_ORDER;

  const showOffTrack =
    !stageFilter || stageFilter === "all" || isOffTrackFilter;

  return (
    <div className="overflow-x-auto pb-4 -mx-1 px-1">
      <div className="flex gap-2.5 min-w-max items-start">
        {activeStagesToShow.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            targets={byStage.get(stage) ?? []}
            aiMode={aiMode}
          />
        ))}

        {showOffTrack && (
          <KanbanColumn
            stage="Off-Track"
            targets={offTrackTargets}
            aiMode={aiMode}
            isOffTrack
          />
        )}
      </div>
    </div>
  );
}
