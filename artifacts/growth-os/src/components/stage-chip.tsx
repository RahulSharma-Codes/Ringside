import React from "react";

export function getStageChipClass(stage: string): string {
  if (stage === "Closed" || stage === "Completed" || stage === "Signed")
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  if (stage === "Dropped" || stage === "Rejected")
    return "bg-destructive/10 text-destructive border-destructive/20";
  if (stage === "On Hold")
    return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return "bg-muted/50 text-muted-foreground border-border/60";
}

export function StageChip({
  stage,
  size = "sm",
}: {
  stage: string;
  size?: "xs" | "sm";
}) {
  const cls = getStageChipClass(stage);
  const sizeClass =
    size === "xs"
      ? "text-[9px] px-1.5 py-0.5"
      : "text-[10px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center font-mono uppercase rounded-md border ${sizeClass} ${cls}`}
    >
      {stage}
    </span>
  );
}
