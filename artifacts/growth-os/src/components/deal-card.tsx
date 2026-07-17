import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
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
    case "Must-Win":   return "border-l-destructive/60";
    case "Priority 1": return "border-l-amber-500/60";
    case "Priority 2": return "border-l-primary/60";
    default:           return "border-l-border/40";
  }
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
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
  const targetHref = href ?? `/targets/${deal.id}`;

  const cardBody = (
    <div
      className={`
        deal-card-lift group/dealcard
        bg-card border border-border/60 border-l-4
        ${getTierAccent(deal.priorityTier)}
        rounded-xl p-3.5 space-y-2.5
        ${deal.needsAttention ? "ring-1 ring-amber-500/20" : ""}
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug truncate group-hover/dealcard:text-primary transition-colors">
            {deal.projectName ?? deal.targetCode}
          </p>
          <p className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider mt-0.5">
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
          <span className={`text-[9px] font-mono font-semibold ${getScoreColor(deal.priorityScore)}`}>
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
    </div>
  );

  const wrapped = href !== "" ? (
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
