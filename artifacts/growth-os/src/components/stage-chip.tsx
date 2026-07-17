import React from "react";

const STAGE_STYLES: Record<string, string> = {
  "Sourcing":                    "bg-sky-500/10 text-sky-700 border-sky-400/30 dark:text-sky-400 dark:bg-sky-500/12 dark:border-sky-500/25",
  "Outreach":                    "bg-blue-500/10 text-blue-700 border-blue-400/30 dark:text-blue-400 dark:bg-blue-500/12 dark:border-blue-500/25",
  "Introductory Discussion":     "bg-indigo-500/10 text-indigo-700 border-indigo-400/30 dark:text-indigo-400 dark:bg-indigo-500/12 dark:border-indigo-500/25",
  "NDA / CIM":                   "bg-violet-500/10 text-violet-700 border-violet-400/30 dark:text-violet-400 dark:bg-violet-500/12 dark:border-violet-500/25",
  "Preliminary Due Diligence":   "bg-purple-500/10 text-purple-700 border-purple-400/30 dark:text-purple-400 dark:bg-purple-500/12 dark:border-purple-500/25",
  "Management Meeting":          "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-400/30 dark:text-fuchsia-400 dark:bg-fuchsia-500/12 dark:border-fuchsia-500/25",
  "Non-Binding Offer":           "bg-amber-500/10 text-amber-700 border-amber-400/30 dark:text-amber-400 dark:bg-amber-500/12 dark:border-amber-500/25",
  "Confirmatory Due Diligence":  "bg-orange-500/10 text-orange-700 border-orange-400/30 dark:text-orange-400 dark:bg-orange-500/12 dark:border-orange-500/25",
  "Binding Offer":               "bg-rose-500/10 text-rose-700 border-rose-400/30 dark:text-rose-400 dark:bg-rose-500/12 dark:border-rose-500/25",
  "SPA Negotiation":             "bg-pink-500/10 text-pink-700 border-pink-400/30 dark:text-pink-400 dark:bg-pink-500/12 dark:border-pink-500/25",
  "NewCo Formation":             "bg-cyan-500/10 text-cyan-700 border-cyan-400/30 dark:text-cyan-400 dark:bg-cyan-500/12 dark:border-cyan-500/25",
  "Integration Planning":        "bg-teal-500/10 text-teal-700 border-teal-400/30 dark:text-teal-400 dark:bg-teal-500/12 dark:border-teal-500/25",
  "Closing":                     "bg-emerald-500/10 text-emerald-700 border-emerald-400/30 dark:text-emerald-400 dark:bg-emerald-500/12 dark:border-emerald-500/25",
  "Closed":                      "bg-emerald-600/10 text-emerald-700 border-emerald-500/35 dark:text-emerald-300 dark:bg-emerald-600/15 dark:border-emerald-600/30",
  "Completed":                   "bg-green-500/10 text-green-700 border-green-400/30 dark:text-green-400 dark:bg-green-500/12 dark:border-green-500/25",
  "Signed":                      "bg-green-600/10 text-green-700 border-green-500/30 dark:text-green-300 dark:bg-green-600/15 dark:border-green-600/25",
  "On Hold":                     "bg-yellow-500/10 text-yellow-700 border-yellow-400/30 dark:text-yellow-400 dark:bg-yellow-500/12 dark:border-yellow-500/25",
  "Dropped":                     "bg-destructive/8 text-destructive border-destructive/25",
  "Rejected":                    "bg-destructive/8 text-destructive border-destructive/25",
};

export function getStageChipClass(stage: string): string {
  return STAGE_STYLES[stage] ?? "bg-muted/50 text-muted-foreground border-border/60";
}

export function getStageColor(stage: string): string {
  return STAGE_STYLES[stage] ?? "bg-muted/50 text-muted-foreground border-border/60";
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
