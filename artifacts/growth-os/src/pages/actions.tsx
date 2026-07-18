import React, { useState, useMemo, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUpdateAction, customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
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
import { format, parseISO } from "date-fns";
import {
  CheckCircle2, RotateCcw, AlertTriangle, Clock,
  ChevronDown, ChevronRight, Search, SlidersHorizontal, Filter, X,
  ChevronsUpDown, ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { CheckCheck, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SafeHtml } from "@/components/ui/safe-html";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCard } from "@/components/skeleton";
import { useToast } from "@/hooks/use-toast";

const SORT_KEY  = "ringside_actions_sort_v1";
const SIZES_KEY = "ringside_actions_sizes_v1";

interface FiltersData { dealTypes: string[] }

function getUrlParam(key: string): string {
  try { return new URLSearchParams(window.location.search).get(key) ?? ""; } catch { return ""; }
}
function setUrlParam(key: string, value: string) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (value) { params.set(key, value); } else { params.delete(key); }
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  } catch { /* ignore */ }
}

interface CommandCenterAction {
  id: number;
  targetId: number;
  description: string;
  owner: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  createdAt: string | null;
  completedAt: string | null;
  targetName: string;
  targetCode: string | null;
  priorityTier: string | null;
  currentStage: string;
}

type GroupKey = "overdue" | "blocked" | "this-week" | "upcoming" | "no-date" | "completed";
type EnrichedAction = CommandCenterAction & { groupKey: GroupKey };

const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

type GroupDef = {
  key: GroupKey;
  label: string;
  emptyMsg: string;
  badgeCls: string;
  headerCls: string;
  defaultOpen: boolean;
};

const GROUPS: GroupDef[] = [
  { key: "overdue",   label: "Overdue",           emptyMsg: "No overdue actions — pipeline looks clean.",  badgeCls: "bg-destructive text-white",             headerCls: "group-header-overdue",  defaultOpen: true  },
  { key: "blocked",   label: "Blocked",            emptyMsg: "No blocked actions.",                         badgeCls: "bg-orange-500 text-white",              headerCls: "group-header-blocked",  defaultOpen: true  },
  { key: "this-week", label: "Due This Week",       emptyMsg: "Nothing due in the next 7 days.",            badgeCls: "bg-amber-500 text-white",               headerCls: "group-header-thisweek", defaultOpen: true  },
  { key: "upcoming",  label: "Upcoming",            emptyMsg: "No upcoming actions with a future due date.", badgeCls: "bg-primary/80 text-primary-foreground", headerCls: "",                      defaultOpen: true  },
  { key: "no-date",   label: "No Due Date",         emptyMsg: "All actions have due dates assigned.",       badgeCls: "bg-muted-foreground text-white",        headerCls: "",                      defaultOpen: false },
  { key: "completed", label: "Recently Completed",  emptyMsg: "No actions completed in the last 14 days.",  badgeCls: "bg-emerald-600 text-white",             headerCls: "group-header-complete", defaultOpen: false },
];

function classifyAction(a: CommandCenterAction, todayStr: string, weekEndStr: string): GroupKey {
  if (a.status === "Completed") return "completed";
  if (a.status === "Blocked")   return "blocked";
  if (!a.dueDate)               return "no-date";
  if (a.dueDate < todayStr)     return "overdue";
  if (a.dueDate <= weekEndStr)  return "this-week";
  return "upcoming";
}

function tierClass(tier: string | null) {
  if (tier === "Must-Win")   return "bg-destructive/10 text-destructive border-destructive/30";
  if (tier === "Priority 1") return "bg-amber-500/10 text-amber-500 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function SortIcon({ direction }: { direction: false | SortDirection }) {
  if (direction === "asc")  return <ChevronUp size={10} className="text-primary shrink-0" />;
  if (direction === "desc") return <ChevronDown size={10} className="text-primary shrink-0" />;
  return <ChevronsUpDown size={10} className="text-muted-foreground/40 shrink-0" />;
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "Blocked"     ? "bg-destructive/10 text-destructive border-destructive/20" :
    status === "In Progress" ? "bg-primary/10 text-primary border-primary/20" :
    status === "Completed"   ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
    "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-mono border ${cls}`}>
      {status}
    </span>
  );
}

function buildColumns(
  todayStr: string,
  onComplete: (id: number) => void,
  onReopen: (id: number) => void,
  isPending: boolean,
): ColumnDef<EnrichedAction>[] {
  return [
    {
      id: "description",
      header: "Description",
      accessorFn: (r) => r.description,
      size: 280,
      minSize: 130,
      cell: ({ row }) => {
        const a = row.original;
        const isOverdue = a.dueDate && a.dueDate < todayStr && a.status !== "Completed";
        return (
          <div className={`text-[12px] font-medium leading-snug ${isOverdue ? "text-destructive" : ""}`}>
            <SafeHtml html={a.description} className="[&_p]:mb-0 [&_ul]:my-0 [&_ol]:my-0" />
            {isOverdue && <AlertTriangle size={10} className="inline ml-1 shrink-0" />}
          </div>
        );
      },
    },
    {
      id: "deal",
      header: "Deal",
      accessorFn: (r) => r.targetName,
      size: 155,
      minSize: 90,
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="min-w-0">
            <Link href={`/targets/${a.targetId}`}>
              <span className="text-[11px] font-mono text-primary hover:underline underline-offset-2 cursor-pointer block truncate">
                {a.targetName}
              </span>
            </Link>
            {a.targetCode && (
              <span className="text-[10px] font-mono text-muted-foreground/50 block truncate">{a.targetCode}</span>
            )}
            {a.priorityTier && (
              <span className={`inline-flex px-1 py-0 rounded text-[9px] font-mono border mt-0.5 ${tierClass(a.priorityTier)}`}>
                {a.priorityTier}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "stage",
      header: "Stage",
      accessorFn: (r) => r.currentStage,
      size: 120,
      minSize: 80,
      cell: ({ row }) => (
        <span className="text-[10px] font-mono text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded-md whitespace-nowrap">
          {row.original.currentStage}
        </span>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      accessorFn: (r) => PRIORITY_ORDER[r.priority] ?? 9,
      size: 85,
      minSize: 65,
      cell: ({ row }) => (
        <Badge
          variant={row.original.priority === "Critical" ? "destructive" : row.original.priority === "High" ? "outline" : "secondary"}
          className="text-[10px] font-mono"
        >
          {row.original.priority}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (r) => r.status,
      size: 95,
      minSize: 70,
      cell: ({ row }) => <StatusPill status={row.original.status} />,
    },
    {
      id: "owner",
      header: "Owner",
      accessorFn: (r) => r.owner ?? "",
      size: 100,
      minSize: 65,
      cell: ({ row }) => (
        <span className="text-[11px] font-mono text-muted-foreground truncate block">
          {row.original.owner ?? <span className="text-muted-foreground/40">—</span>}
        </span>
      ),
    },
    {
      id: "dueDate",
      header: "Due",
      accessorFn: (r) => r.dueDate ?? "",
      size: 100,
      minSize: 70,
      cell: ({ row }) => {
        const a = row.original;
        if (!a.dueDate) return <span className="text-[10px] font-mono text-muted-foreground/40">—</span>;
        const isOverdue = a.dueDate < todayStr && a.status !== "Completed";
        if (a.status === "Completed" && a.completedAt) {
          return (
            <span className="text-[10px] font-mono text-emerald-500 flex items-center gap-1 whitespace-nowrap">
              <CheckCircle2 size={9} />
              {format(parseISO(a.completedAt), "MMM d")}
            </span>
          );
        }
        return (
          <span className={`text-[10px] font-mono flex items-center gap-1 whitespace-nowrap ${isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
            <Clock size={9} />
            {format(parseISO(a.dueDate), "MMM d")}
          </span>
        );
      },
    },
    {
      id: "_action",
      header: "",
      enableSorting: false,
      enableResizing: false,
      size: 80,
      minSize: 80,
      cell: ({ row }) => {
        const a = row.original;
        return a.status !== "Completed" ? (
          <motion.div whileTap={{ scale: 0.93 }} style={{ display: "inline-flex" }}>
            <Button
              size="sm"
              className="h-6 text-[9px] font-mono uppercase rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 px-2"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onComplete(a.id); }}
              disabled={isPending}
            >
              <CheckCircle2 size={10} className="mr-0.5" /> Done
            </Button>
          </motion.div>
        ) : (
          <motion.div whileTap={{ scale: 0.93 }} style={{ display: "inline-flex" }}>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[9px] font-mono uppercase rounded-lg shrink-0 px-2"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onReopen(a.id); }}
              disabled={isPending}
            >
              <RotateCcw size={10} className="mr-0.5" /> Reopen
            </Button>
          </motion.div>
        );
      },
    },
  ];
}

export default function Actions() {
  const shouldReduceActions = useReducedMotion();
  const { toast }      = useToast();
  const queryClient    = useQueryClient();
  const { user }       = useAuth();
  const [ownerFilter, setOwnerFilter]       = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [mustWinOnly, setMustWinOnly]       = useState(false);
  const [overdueOnly, setOverdueOnly]       = useState(false);
  const [mineOnly, setMineOnly]             = useState(() => getUrlParam("mine") === "true");
  const [dealTypeFilter, setDealTypeFilter] = useState(() => getUrlParam("dealType"));
  const [search, setSearch]                 = useState("");

  const [openGroups, setOpenGroups] = useState<Record<GroupKey, boolean>>(
    () => Object.fromEntries(GROUPS.map((g) => [g.key, g.defaultOpen])) as Record<GroupKey, boolean>,
  );

  const [sorting, setSorting] = useState<SortingState>(() => {
    try { const s = localStorage.getItem(SORT_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    try { const s = localStorage.getItem(SIZES_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

  useEffect(() => { setUrlParam("dealType", dealTypeFilter); }, [dealTypeFilter]);
  useEffect(() => { try { localStorage.setItem(SORT_KEY, JSON.stringify(sorting)); } catch {} }, [sorting]);
  useEffect(() => { try { localStorage.setItem(SIZES_KEY, JSON.stringify(columnSizing)); } catch {} }, [columnSizing]);

  const commandCenterUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (mineOnly) params.set("mine", "true");
    if (dealTypeFilter) params.set("dealType", dealTypeFilter);
    const qs = params.toString();
    return `/api/actions/command-center${qs ? `?${qs}` : ""}`;
  }, [mineOnly, dealTypeFilter]);

  const { data: actions, isLoading } = useQuery({
    queryKey: ["actions-command-center", mineOnly, dealTypeFilter],
    queryFn: () => customFetch<CommandCenterAction[]>(commandCenterUrl),
  });

  const { data: filtersData } = useQuery({
    queryKey: ["targets-filters"],
    queryFn: () => customFetch<FiltersData>("/api/targets/filters"),
    staleTime: 5 * 60 * 1000,
  });
  const availableDealTypes = filtersData?.dealTypes ?? [];

  const updateAction = useUpdateAction();

  const handleStatus = useCallback((id: number, status: string) => {
    updateAction.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: status === "Completed" ? "Action completed" : "Action reopened" });
          queryClient.invalidateQueries({ queryKey: ["actions-command-center"] });
        },
        onError: () => toast({ title: "Error updating action", variant: "destructive" }),
      },
    );
  }, [updateAction, toast, queryClient]);

  const handleComplete = useCallback((id: number) => handleStatus(id, "Completed"), [handleStatus]);
  const handleReopen   = useCallback((id: number) => handleStatus(id, "Open"), [handleStatus]);

  const owners = useMemo(
    () => Array.from(new Set((actions ?? []).map((a) => a.owner).filter((o): o is string => !!o))),
    [actions],
  );

  const todayStr   = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const weekEndStr = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }, []);

  const enrichedFiltered = useMemo<EnrichedAction[]>(() => {
    if (!actions) return [];
    return actions
      .filter((a) => {
        if (ownerFilter !== "all" && a.owner !== ownerFilter) return false;
        if (priorityFilter !== "all" && a.priority !== priorityFilter) return false;
        if (mustWinOnly && a.priorityTier !== "Must-Win") return false;
        if (overdueOnly) {
          const isOver = a.dueDate && a.dueDate < todayStr && a.status !== "Completed";
          if (!isOver) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          if (!a.description.toLowerCase().includes(q) && !a.targetName.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .map((a) => ({ ...a, groupKey: classifyAction(a, todayStr, weekEndStr) }));
  }, [actions, ownerFilter, priorityFilter, mustWinOnly, overdueOnly, search, todayStr, weekEndStr]);

  const columns = useMemo(
    () => buildColumns(todayStr, handleComplete, handleReopen, updateAction.isPending),
    [todayStr, handleComplete, handleReopen, updateAction.isPending],
  );

  const table = useReactTable({
    data: enrichedFiltered,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: true,
    columnResizeMode: "onChange",
  });

  const sortedRows = table.getRowModel().rows;

  const grouped = useMemo(() => {
    const map = Object.fromEntries(GROUPS.map((g) => [g.key, [] as typeof sortedRows])) as Record<GroupKey, typeof sortedRows>;
    for (const row of sortedRows) map[row.original.groupKey].push(row);
    return map;
  }, [sortedRows]);

  const totalOpen    = useMemo(() => (actions ?? []).filter((a) => a.status !== "Completed").length, [actions]);
  const overdueCount = useMemo(() => (actions ?? []).filter((a) => a.dueDate && a.dueDate < todayStr && a.status !== "Completed").length, [actions, todayStr]);

  const toggleGroup = useCallback((key: GroupKey) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleHeaderClick = useCallback((e: React.MouseEvent, header: ReturnType<typeof table.getHeaderGroups>[0]["headers"][0]) => {
    if (!header.column.getCanSort()) return;
    header.column.toggleSorting(undefined, e.shiftKey);
  }, [table]);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Sticky compact header */}
      <div className="page-hero px-4 md:px-6 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold font-sans tracking-tight">Actions</h1>
              {!isLoading && totalOpen > 0 && (
                <span className="text-[11px] font-mono text-muted-foreground/50 bg-muted/60 border border-border/40 px-1.5 py-0.5 rounded-md">{totalOpen} open</span>
              )}
              {overdueCount > 0 && (
                <span className="status-chip bg-destructive/10 text-destructive border-destructive/30">{overdueCount} overdue</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden md:block font-sans">Manage overdue, blocked, and upcoming execution items across the full inorganic growth pipeline.</p>
          </div>
        </div>

        {user && (
          <div className="flex items-center border border-border/60 rounded-lg overflow-hidden h-7 mb-1.5">
            <button
              onClick={() => setMineOnly(false)}
              className={`px-3 h-7 text-[11px] font-mono transition-colors ${!mineOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
            >All</button>
            <button
              onClick={() => setMineOnly(true)}
              className={`px-3 h-7 text-[11px] font-mono transition-colors ${mineOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
            >Mine</button>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 items-center">
          <div className="relative flex-1 min-w-[130px] max-w-[200px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              className="pl-7 h-7 text-xs rounded-lg bg-card/60 border-border/60" />
          </div>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[120px] h-7 rounded-lg font-sans text-[11px] border-border/60">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[115px] h-7 rounded-lg font-sans text-[11px] border-border/60">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={() => setMustWinOnly((v) => !v)}
            className={`h-7 px-2.5 rounded-lg text-[11px] font-mono border transition-all duration-150 ${mustWinOnly ? "bg-primary/15 text-primary border-primary/40" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
          >Must-Win</button>
          <button
            onClick={() => setOverdueOnly((v) => !v)}
            className={`h-7 px-2.5 rounded-lg text-[11px] font-mono border transition-all duration-150 flex items-center gap-1.5 ${overdueOnly ? "bg-destructive text-white border-destructive" : "border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/40"}`}
          >
            <SlidersHorizontal size={12} /> Overdue Only
          </button>
        </div>

        {availableDealTypes.length > 0 && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/40">
            <Filter size={11} className="text-muted-foreground/50 shrink-0" />
            <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider shrink-0">Deal Type</span>
            <Select value={dealTypeFilter || "_all"} onValueChange={(v) => setDealTypeFilter(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-6 text-[10px] font-sans rounded-md border-border/60 bg-background w-[160px] px-2">
                <SelectValue placeholder="All deal types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all" className="text-[11px] font-sans">All deal types</SelectItem>
                {availableDealTypes.map((dt) => (
                  <SelectItem key={dt} value={dt} className="text-[11px] font-sans">{dt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {dealTypeFilter && (
              <button onClick={() => setDealTypeFilter("")}
                className="text-[10px] font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors flex items-center gap-1">
                <X size={10} /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {isLoading ? (
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden space-y-0">
            {Array(4).fill(0).map((_, g) => (
              <div key={g} className="border-b border-border/40 last:border-b-0">
                {/* Group header skeleton */}
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                  <Skeleton className="h-3 w-3 rounded" />
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="h-4 w-6 rounded-full ml-auto" />
                </div>
                {/* Row skeletons */}
                {g < 2 && Array(g === 0 ? 2 : 3).fill(0).map((_, r) => (
                  <div key={r} className="flex items-center gap-4 px-3 py-2.5 border-t border-border/20">
                    <Skeleton className="h-3 w-56" />
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-20 ml-auto" />
                    <Skeleton className="h-5 w-14 rounded-lg" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
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
                                header.column.getIsResizing() ? "bg-primary/60" : "hover:bg-primary/30 bg-transparent"
                              }`}
                            />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {GROUPS.map((group) => {
                  const rows = grouped[group.key];
                  const isOpen = openGroups[group.key];
                  const colCount = table.getVisibleLeafColumns().length;

                  return (
                    <React.Fragment key={group.key}>
                      {/* Group header row */}
                      <tr
                        className={`border-b border-border/40 cursor-pointer select-none transition-colors hover:bg-muted/20 ${group.headerCls}`}
                        onClick={() => toggleGroup(group.key)}
                      >
                        <td colSpan={colCount} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {isOpen
                              ? <ChevronDown size={12} className="text-muted-foreground shrink-0" />
                              : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
                            <span className="text-[11px] font-mono uppercase tracking-wider font-semibold flex-1">
                              {group.label}
                            </span>
                            {rows.length > 0 ? (
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${group.badgeCls}`}>
                                {rows.length}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-muted-foreground/50">0</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Empty state row */}
                      {isOpen && rows.length === 0 && (
                        <tr className="border-b border-border/40">
                          <td colSpan={colCount} className="px-3 py-2">
                            <EmptyState
                              icon={group.key === "completed" ? CheckCheck : ClipboardList}
                              title={group.emptyMsg}
                              size="sm"
                              className="py-4"
                            />
                          </td>
                        </tr>
                      )}

                      {/* Data rows */}
                      {isOpen && rows.map((row, rowIdx) => {
                        const isOverdue = row.original.dueDate && row.original.dueDate < todayStr && row.original.status !== "Completed";
                        const isLast = rowIdx === rows.length - 1;
                        return (
                          <motion.tr
                            key={row.id}
                            initial={{ opacity: 0, y: shouldReduceActions ? 0 : 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              delay: shouldReduceActions ? 0 : rowIdx * 0.04,
                              duration: shouldReduceActions ? 0 : 0.15,
                              ease: "easeOut",
                            }}
                            className={`transition-colors group ${!isLast ? "border-b border-border/30" : "border-b border-border/40"} ${
                              isOverdue ? "bg-destructive/5 hover:bg-destructive/8" : "hover:bg-muted/30"
                            }`}
                          >
                            {row.getVisibleCells().map((cell) => (
                              <td
                                key={cell.id}
                                style={{ width: cell.column.getSize() }}
                                className="px-3 py-2.5 align-middle overflow-hidden"
                              >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </td>
                            ))}
                          </motion.tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Sort status footer */}
            {sorting.length > 0 && (
              <div className="px-3 py-1.5 border-t border-border/40 bg-muted/20 flex items-center gap-2 text-[10px] font-mono text-muted-foreground/60">
                <span>Sorted by:</span>
                {sorting.map((s, i) => {
                  const col = columns.find((c) => c.id === s.id);
                  return (
                    <span key={s.id} className="text-foreground/60">
                      {i > 0 && <span className="text-muted-foreground/40 mr-1">then</span>}
                      {(typeof col?.header === "string" ? col.header : s.id)}{s.desc ? " ↓" : " ↑"}
                    </span>
                  );
                })}
                <button onClick={() => setSorting([])} className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                  Reset
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
