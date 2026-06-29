import React from "react";

export type HealthScore = "healthy" | "watch" | "at_risk";

const CONFIG: Record<HealthScore, { bg: string; label: string; ring: string }> = {
  healthy: { bg: "bg-emerald-500", ring: "ring-emerald-500/30", label: "Healthy" },
  watch:   { bg: "bg-amber-400",   ring: "ring-amber-400/30",   label: "Watch"   },
  at_risk: { bg: "bg-destructive", ring: "ring-destructive/30", label: "At Risk" },
};

interface HealthDotProps {
  score: HealthScore | null | undefined;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function HealthDot({ score, showLabel = false, size = "sm" }: HealthDotProps) {
  if (!score) return null;
  const c = CONFIG[score];
  const dotSize = size === "md" ? "w-3 h-3" : "w-2.5 h-2.5";
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <span
        className={`${dotSize} rounded-full ${c.bg} ring-2 ${c.ring} shrink-0`}
        title={c.label}
      />
      {showLabel && (
        <span className={`text-[10px] font-mono uppercase tracking-wider ${
          score === "at_risk" ? "text-destructive" :
          score === "watch"   ? "text-amber-500"   :
          "text-emerald-500"
        }`}>{c.label}</span>
      )}
    </span>
  );
}
