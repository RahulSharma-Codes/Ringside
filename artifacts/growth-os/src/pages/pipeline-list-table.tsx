import React, { useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  ColumnDef,
  SortingState,
  ColumnSizingState,
  flexRender,
  SortDirection,
} from "@tanstack/react-table";
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  AlertTriangle, Calendar, Clock,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { StageChip } from "@/components/stage-chip";
import { HealthDot } from "@/components/health-dot";
import { PIPELINE_STAGE_ORDER } from "@/components/stage-rail";
import { QuickLogInteractionPopover } from "@/components/quick-log-interaction-popover";

const SORT_KEY = "ringside_pipeline_sort_v1";
const SIZES_KEY = "ringside_pipeline_sizes_v1";

const TIER_ORDER: Record<string, number> = {
  "Must-Win": 0, "Priority 1": 1, "Priority 2": 2,
  "Watchlist": 3, "On Hold": 4, "Dropped": 5,
};
const HEALTH_ORDER: Record<string, number> = { healthy: 0, watch: 1, at_risk: 2 };

const NON_DEFAULT_DEAL_TYPES: Record<string, string> = {
  JV: "JV", Partnership: "Partner", "Strategic Alliance": "Alliance",
};

function getTierBadgeColor(tier: string) {
  switch (tier) {
    case "Must-Win":  return "bg-destructive text-destructive-foreground border-0";
    case "Priority 1": return "bg-amber-500 text-white border-0";
    case "Priority 2": return "bg-primary text-primary-foreground border-0";
    case "Watchlist":  return "bg-muted text-muted-foreground border-border";
    default:           return "bg-secondary text-secondary-foreground border-0";
  }
}

export type PipelineRow = {
  id: number;
  targetCode: string;
  projectName: string | null;
  currentStage: string | null;
  priorityTier: string;
  priorityScore: number;
  sector: string | null;
  country: string | null;
  dealOwner: string | null;
  dealType: string | null;
  needsAttention: boolean | null;
  openActionCount: number | null;
  overdueActionCount: number | null;
  lastInteractionDate: string | null;
  daysInCurrentStage: number | null;
  diligencePct: number | null;
  healthScore: "healthy" | "watch" | "at_risk" | null;
};

function SortIcon({ direction }: { direction: false | SortDirection }) {
  if (direction === "asc")  return <ChevronUp size={11} className="text-primary shrink-0" />;
  if (direction === "desc") return <ChevronDown size={11} className="text-primary shrink-0" />;
  return <ChevronsUpDown size={11} className="text-muted-foreground/40 shrink-0" />;
}

const columns: ColumnDef<PipelineRow>[] = [
  {
    id: "company",
    header: "Company",
    accessorFn: (r) => r.projectName ?? r.targetCode,
    size: 240,
    minSize: 140,
    cell: ({ row }) => {
      const r = row.original;
      const hasNonDefault = r.dealType && NON_DEFAULT_DEAL_TYPES[r.dealType];
      return (
        <div className="min-w-0">
          <div className="font-semibold text-[12px] leading-snug truncate">{r.projectName}</div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider">{r.targetCode}</span>
            {hasNonDefault && (
              <span className="text-[9px] font-mono px-1 rounded-sm bg-violet-500/10 text-violet-500 border border-violet-500/20">
                {NON_DEFAULT_DEAL_TYPES[r.dealType!]}
              </span>
            )}
          </div>
        </div>
      );
    },
  },
  {
    id: "stage",
    header: "Stage",
    accessorFn: (r) => r.currentStage ?? "",
    size: 160,
    minSize: 100,
    sortingFn: (a, b) => {
      const ai = PIPELINE_STAGE_ORDER.indexOf(a.original.currentStage ?? "");
      const bi = PIPELINE_STAGE_ORDER.indexOf(b.original.currentStage ?? "");
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    },
    cell: ({ row }) => (
      <div className="flex items-center gap-1 flex-wrap">
        <StageChip stage={row.original.currentStage ?? ""} size="xs" />
        {row.original.daysInCurrentStage != null && (
          <span className="text-[9px] font-mono text-muted-foreground/40 bg-muted/50 px-1 rounded-sm">
            {row.original.daysInCurrentStage}d
          </span>
        )}
      </div>
    ),
  },
  {
    id: "tier",
    header: "Tier",
    accessorFn: (r) => r.priorityTier,
    size: 100,
    minSize: 70,
    sortingFn: (a, b) =>
      (TIER_ORDER[a.original.priorityTier] ?? 9) - (TIER_ORDER[b.original.priorityTier] ?? 9),
    cell: ({ row }) => (
      <Badge className={`font-mono text-[9px] uppercase rounded-md ${getTierBadgeColor(row.original.priorityTier)}`}>
        {row.original.priorityTier}
      </Badge>
    ),
  },
  {
    id: "score",
    header: "Score",
    accessorFn: (r) => r.priorityScore,
    size: 65,
    minSize: 50,
    cell: ({ row }) => {
      const score = Math.round(row.original.priorityScore);
      const colorCls =
        score >= 70 ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25" :
        score >= 40 ? "bg-amber-500/12 text-amber-600 dark:text-amber-400 border border-amber-500/25" :
                     "bg-destructive/10 text-destructive border border-destructive/25";
      return (
        <span className={`inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold ${colorCls}`}>
          {score}
        </span>
      );
    },
  },
  {
    id: "owner",
    header: "Owner",
    accessorFn: (r) => r.dealOwner ?? "",
    size: 110,
    minSize: 70,
    cell: ({ row }) => {
      const owner = row.original.dealOwner;
      if (!owner) return <span className="text-[10px] font-mono text-muted-foreground/40">—</span>;
      return (
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-mono font-bold uppercase shrink-0"
            title={owner}
          >
            {owner.slice(0, 2)}
          </span>
          <span className="text-[10px] font-mono truncate">{owner}</span>
        </div>
      );
    },
  },
  {
    id: "country",
    header: "Country",
    accessorFn: (r) => r.country ?? "",
    size: 90,
    minSize: 60,
    cell: ({ row }) => (
      <span className="text-[11px] font-mono text-muted-foreground">
        {row.original.country ?? <span className="text-muted-foreground/30">—</span>}
      </span>
    ),
  },
  {
    id: "health",
    header: "Health",
    accessorFn: (r) => HEALTH_ORDER[r.healthScore ?? ""] ?? 9,
    size: 75,
    minSize: 55,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="flex items-center gap-1.5">
          <HealthDot score={r.healthScore} />
          {r.needsAttention && (
            <AlertTriangle size={10} className="text-destructive shrink-0" />
          )}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    accessorFn: (r) => r.openActionCount ?? 0,
    size: 90,
    minSize: 65,
    cell: ({ row }) => {
      const r = row.original;
      const open = r.openActionCount ?? 0;
      const overdue = r.overdueActionCount ?? 0;
      if (open === 0) return <span className="text-[10px] font-mono text-muted-foreground/40">—</span>;
      return (
        <span className={`text-[10px] font-mono font-medium ${overdue > 0 ? "text-destructive" : "text-amber-500"}`}>
          {open} open{overdue > 0 ? ` · ${overdue}⚠` : ""}
        </span>
      );
    },
  },
  {
    id: "lastContact",
    header: "Last Contact",
    accessorFn: (r) => r.lastInteractionDate ?? "",
    size: 110,
    minSize: 80,
    cell: ({ row }) => {
      const d = row.original.lastInteractionDate;
      if (!d) return <span className="text-[10px] font-mono text-muted-foreground/40">—</span>;
      return (
        <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
          <Calendar size={9} />
          {format(parseISO(d), "MMM d, yyyy")}
        </span>
      );
    },
  },
  {
    id: "diligence",
    header: "Diligence",
    accessorFn: (r) => r.diligencePct ?? -1,
    size: 85,
    minSize: 65,
    cell: ({ row }) => {
      const pct = row.original.diligencePct;
      if (pct == null || pct === 0) return <span className="text-[10px] font-mono text-muted-foreground/40">—</span>;
      return (
        <div className="flex items-center gap-1.5">
          <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[9px] font-mono text-muted-foreground/60">{pct}%</span>
        </div>
      );
    },
  },
  {
    id: "_actions",
    header: "",
    enableSorting: false,
    enableResizing: false,
    size: 36,
    minSize: 36,
    cell: ({ row }) => (
      <div className="flex justify-end" onClick={(e) => e.preventDefault()}>
        <QuickLogInteractionPopover
          targetId={row.original.id}
          targetName={row.original.projectName ?? row.original.targetCode}
        />
      </div>
    ),
  },
];

export function PipelineListTable({
  data,
  aiMode,
}: {
  data: PipelineRow[];
  aiMode: "meeting-notes" | "opportunity-brief" | null;
}) {
  const shouldReduce = useReducedMotion();
  const [sorting, setSorting] = useState<SortingState>(() => {
    try {
      const s = localStorage.getItem(SORT_KEY);
      return s ? JSON.parse(s) : [{ id: "stage", desc: false }];
    } catch { return [{ id: "stage", desc: false }]; }
  });

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    try {
      const s = localStorage.getItem(SIZES_KEY);
      return s ? JSON.parse(s) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(SORT_KEY, JSON.stringify(sorting)); } catch {}
  }, [sorting]);

  useEffect(() => {
    try { localStorage.setItem(SIZES_KEY, JSON.stringify(columnSizing)); } catch {}
  }, [columnSizing]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: true,
    columnResizeMode: "onChange",
  });

  const handleHeaderClick = useCallback(
    (e: React.MouseEvent, header: { column: { getCanSort: () => boolean; toggleSorting: (desc?: boolean, multi?: boolean) => void } }) => {
      if (!header.column.getCanSort()) return;
      header.column.toggleSorting(undefined, e.shiftKey);
    },
    [],
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
      <table
        style={{ width: table.getTotalSize(), minWidth: "100%" }}
        className="text-xs border-collapse"
      >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border/60 bg-muted/30">
              {hg.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <th
                    key={header.id}
                    style={{ width: header.getSize(), position: "relative" }}
                    className="px-3 py-2.5 text-left font-medium text-[10px] font-mono uppercase tracking-wider text-muted-foreground select-none"
                  >
                    <div
                      className={`flex items-center gap-1 ${canSort ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
                      onClick={(e) => handleHeaderClick(e, header)}
                      title={canSort ? "Click to sort · Shift+click for multi-sort" : undefined}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && <SortIcon direction={sorted} />}
                    </div>
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none transition-colors ${
                          header.column.getIsResizing()
                            ? "bg-primary/60"
                            : "hover:bg-primary/30 bg-transparent"
                        }`}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <motion.tbody
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: shouldReduce ? 0 : 0.035 } },
          }}
          initial="hidden"
          animate="show"
        >
          {table.getRowModel().rows.map((row, idx) => {
            const r = row.original;
            const href = aiMode ? `/targets/${r.id}?ai=${aiMode}` : `/targets/${r.id}`;
            const isLast = idx === table.getRowModel().rows.length - 1;
            return (
              <motion.tr
                key={row.id}
                variants={
                  shouldReduce
                    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0 } } }
                    : { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: "easeOut" } } }
                }
                className={`group transition-colors hover:bg-muted/40 cursor-pointer ${
                  !isLast ? "border-b border-border/40" : ""
                } ${r.needsAttention ? "bg-destructive/3" : ""}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                    className="px-3 py-2.5 align-middle overflow-hidden"
                  >
                    {cell.column.id === "_actions" ? (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    ) : (
                      <Link href={href} className="block w-full h-full">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </Link>
                    )}
                  </td>
                ))}
              </motion.tr>
            );
          })}
          {table.getRowModel().rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-[11px] font-mono text-muted-foreground">
                No targets match the selected filters
              </td>
            </tr>
          )}
        </motion.tbody>
      </table>
      {sorting.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border/40 bg-muted/20 flex items-center gap-2 text-[10px] font-mono text-muted-foreground/60">
          <span>Sorted by:</span>
          {sorting.map((s, i) => (
            <span key={s.id} className="text-foreground/60">
              {i > 0 && <span className="text-muted-foreground/40 mr-1">then</span>}
              {columns.find((c) => c.id === s.id)?.header as string ?? s.id}
              {s.desc ? " ↓" : " ↑"}
            </span>
          ))}
          <button
            onClick={() => setSorting([])}
            className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
