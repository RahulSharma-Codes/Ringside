import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { AlertTriangle, ExternalLink, Zap } from "lucide-react";
import { StageChip } from "@/components/stage-chip";
import { HealthDot } from "@/components/health-dot";

export interface DealCardData {
  id: number;
  targetCode: string;
  projectName?: string | null;
  currentStage?: string | null;
  priorityTier?: string | null;
  priorityScore?: number | null;
  needsAttention?: boolean | null;
  healthScore?: "healthy" | "watch" | "at_risk" | null;
  dealOwner?: string | null;
  daysInCurrentStage?: number | null;
}

function getTierAccent(tier: string | null | undefined): string {
  switch (tier) {
    case "Must-Win":   return "border-l-destructive/70";
    case "Priority 1": return "border-l-amber-500/70";
    case "Priority 2": return "border-l-primary/70";
    default:           return "border-l-border/30";
  }
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function getScoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-500/10";
  if (score >= 40) return "bg-amber-500/10";
  return "bg-destructive/10";
}

interface DealCardProps {
  deal: DealCardData;
  href?: string;
  className?: string;
  animate?: boolean;
  animDelay?: number;
  children?: React.ReactNode;
}

export function DealCard({ deal, href, className = "", animate = true, animDelay = 0, children }: DealCardProps) {
  const targetHref = href != null && href !== "" ? href : `/targets/${deal.id}`;
  const isLinked = href !== "";

  const cardBody = (
    <div
      className={`
        deal-card-lift group/dealcard relative
        bg-card border-l-4 shadow-sm
        ${getTierAccent(deal.priorityTier)}
        rounded-xl p-3.5 space-y-2.5
        ${deal.needsAttention ? "ring-1 ring-amber-500/35 shadow-[0_0_14px_hsl(38_82%_50%_/_0.10)]" : ""}
        transition-all duration-200
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug truncate group-hover/dealcard:text-primary transition-colors font-sans">
            {deal.projectName ?? deal.targetCode}
          </p>
          <p className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-wider mt-0.5">
            {deal.targetCode}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {deal.needsAttention && <AlertTriangle size={11} className="text-amber-500" />}
          <HealthDot score={deal.healthScore} />
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {deal.currentStage && (
          <StageChip stage={deal.currentStage} size="xs" />
        )}
        {deal.priorityScore != null && (
          <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-md ${getScoreColor(deal.priorityScore)} ${getScoreBg(deal.priorityScore)}`}>
            {Math.round(deal.priorityScore)}
          </span>
        )}
        {deal.daysInCurrentStage != null && (
          <span className="text-[9px] font-mono text-muted-foreground/50 bg-muted/60 px-1.5 py-0 rounded-sm leading-5">
            {deal.daysInCurrentStage}d
          </span>
        )}
      </div>

      {/* Slot for action buttons, progress bars, etc. */}
      {children}

      {/* Hover-reveal quick-action icon row */}
      {isLinked && (
        <div className="flex items-center justify-between opacity-0 group-hover/dealcard:opacity-100 transition-opacity duration-150 pt-0.5 border-t border-border/20">
          <span className="text-[10px] font-sans text-muted-foreground/50">
            {deal.dealOwner ?? ""}
          </span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] font-sans text-primary/70 group-hover/dealcard:text-primary transition-colors">
              <ExternalLink size={10} />
              Open
            </span>
          </div>
        </div>
      )}
    </div>
  );

  const wrapped = isLinked ? (
    <Link href={targetHref} className="block">{cardBody}</Link>
  ) : cardBody;

  if (!animate) return wrapped;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: animDelay, ease: "easeOut" }}
    >
      {wrapped}
    </motion.div>
  );
}
