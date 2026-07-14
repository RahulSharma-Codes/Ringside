import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUpdateAction, customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { MobileLongPressTray } from "@/components/mobile-long-press-tray";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2, RotateCcw, AlertTriangle, Clock,
  ChevronDown, ChevronRight, Search, SlidersHorizontal, Filter, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface FiltersData {
  dealTypes: string[];
}

// ── URL query string helpers ───────────────────────────────────────────────
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

const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function tierClass(tier: string | null) {
  if (tier === "Must-Win")   return "bg-destructive/10 text-destructive border-destructive/30";
  if (tier === "Priority 1") return "bg-amber-500/10 text-amber-500 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
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

type GroupKey = "overdue" | "blocked" | "this-week" | "upcoming" | "no-date" | "completed";

type GroupDef = {
  key: GroupKey;
  label: string;
  emptyMsg: string;
  badgeCls: string;
  headerCls: string;
  defaultOpen: boolean;
};

const GROUPS: GroupDef[] = [
  { key: "overdue",   label: "Overdue",           emptyMsg: "No overdue actions — pipeline looks clean.",        badgeCls: "bg-destructive text-white",             headerCls: "group-header-overdue",  defaultOpen: true  },
  { key: "blocked",   label: "Blocked",            emptyMsg: "No blocked actions.",                               badgeCls: "bg-orange-500 text-white",              headerCls: "group-header-blocked",  defaultOpen: true  },
  { key: "this-week", label: "Due This Week",       emptyMsg: "Nothing due in the next 7 days.",                  badgeCls: "bg-amber-500 text-white",               headerCls: "group-header-thisweek", defaultOpen: true  },
  { key: "upcoming",  label: "Upcoming",            emptyMsg: "No upcoming actions with a future due date.",       badgeCls: "bg-primary/80 text-primary-foreground", headerCls: "",                      defaultOpen: true  },
  { key: "no-date",   label: "No Due Date",         emptyMsg: "All actions have due dates assigned.",             badgeCls: "bg-muted-foreground text-white",        headerCls: "",                      defaultOpen: false },
  { key: "completed", label: "Recently Completed",  emptyMsg: "No actions completed in the last 14 days.",        badgeCls: "bg-emerald-600 text-white",             headerCls: "group-header-complete", defaultOpen: false },
];

function classifyAction(a: CommandCenterAction, todayStr: string, weekEndStr: string): GroupKey {
  if (a.status === "Completed") return "completed";
  if (a.status === "Blocked")   return "blocked";
  if (!a.dueDate)               return "no-date";
  if (a.dueDate < todayStr)     return "overdue";
  if (a.dueDate <= weekEndStr)  return "this-week";
  return "upcoming";
}

function ActionCard({
  action, todayStr, onComplete, onReopen, isPending,
}: {
  action: CommandCenterAction;
  todayStr: string;
  onComplete: () => void;
  onReopen: () => void;
  isPending: boolean;
}) {
  const isOverdue = action.dueDate && action.dueDate < todayStr && action.status !== "Completed";

  return (
    <Card className={`border-border/60 rounded-xl transition-colors ${isOverdue ? "bg-destructive/5 border-l-2 border-l-destructive" : "bg-card"}`}>
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-start gap-3">
          <p className="text-sm font-medium leading-snug flex-1">{action.description}</p>
          {action.status !== "Completed" ? (
            <Button
              size="sm"
              className="h-7 text-[10px] font-mono uppercase rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
              onClick={onComplete}
              disabled={isPending}
            >
              <CheckCircle2 size={11} className="mr-1" /> Done
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] font-mono uppercase rounded-lg shrink-0"
              onClick={onReopen}
              disabled={isPending}
            >
              <RotateCcw size={11} className="mr-1" /> Reopen
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <Link href={`/targets/${action.targetId}`}>
            <span className="text-[11px] font-mono text-primary hover:underline underline-offset-2 cursor-pointer">
              {action.targetName}{action.targetCode ? ` · ${action.targetCode}` : ""}
            </span>
          </Link>
          {action.priorityTier && (
            <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-mono border ${tierClass(action.priorityTier)}`}>
              {action.priorityTier}
            </span>
          )}
          <span className="text-[10px] font-mono text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded-md">
            {action.currentStage}
          </span>
          <StatusPill status={action.status} />
          <Badge
            variant={action.priority === "Critical" ? "destructive" : action.priority === "High" ? "outline" : "secondary"}
            className="text-[10px] font-mono"
          >
            {action.priority}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>Owner: <span className="text-foreground">{action.owner ?? "Unassigned"}</span></span>
          {action.dueDate && (
            <span className={`flex items-center gap-1 ${isOverdue ? "text-destructive font-semibold" : ""}`}>
              <Clock size={11} />
              {isOverdue && <AlertTriangle size={11} />}
              {format(parseISO(action.dueDate), "MMM d, yyyy")}
              {isOverdue && " · Overdue"}
            </span>
          )}
          {action.completedAt && action.status === "Completed" && (
            <span className="flex items-center gap-1 text-emerald-500">
              <CheckCircle2 size={11} />
              Completed {format(parseISO(action.completedAt), "MMM d")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GroupSection({
  group, actions, todayStr, onComplete, onReopen, isPending,
}: {
  group: GroupDef;
  actions: CommandCenterAction[];
  todayStr: string;
  onComplete: (id: number) => void;
  onReopen: (id: number) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(group.defaultOpen);

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`section-header rounded-t-xl w-full ${group.headerCls}`}
      >
        {open
          ? <ChevronDown size={13} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
        <span className="text-[11px] font-mono uppercase tracking-wider font-semibold flex-1 text-left">
          {group.label}
        </span>
        {actions.length > 0 && (
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 font-semibold ${group.badgeCls}`}>
            {actions.length}
          </span>
        )}
        {actions.length === 0 && (
          <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">0</span>
        )}
      </button>

      {open && (
        <div className="p-3 space-y-2 border-t border-border/40 bg-background/20">
          {actions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground font-mono px-2 py-3 border border-dashed border-border/50 rounded-lg">
              {group.emptyMsg}
            </p>
          ) : (
            actions.map((a) => (
              <MobileLongPressTray
                key={a.id}
                targetId={a.targetId}
                targetName={a.targetName}
                targetCode={a.targetCode}
                targetHref={`/targets/${a.targetId}`}
                showViewActions={false}
                isCompleted={a.status === "Completed"}
                isCompletePending={isPending}
                onComplete={() => onComplete(a.id)}
                onReopen={() => onReopen(a.id)}
              >
                <ActionCard
                  action={a}
                  todayStr={todayStr}
                  onComplete={() => onComplete(a.id)}
                  onReopen={() => onReopen(a.id)}
                  isPending={isPending}
                />
              </MobileLongPressTray>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Actions() {
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

  // Sync dealType filter to URL
  useEffect(() => {
    setUrlParam("dealType", dealTypeFilter);
  }, [dealTypeFilter]);

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

  // Fetch available deal types for the filter dropdown
  const { data: filtersData } = useQuery({
    queryKey: ["targets-filters"],
    queryFn: () => customFetch<FiltersData>("/api/targets/filters"),
    staleTime: 5 * 60 * 1000,
  });
  const availableDealTypes = filtersData?.dealTypes ?? [];

  const updateAction = useUpdateAction();

  const handleStatus = (id: number, status: string) => {
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
  };

  const owners = useMemo(
    () => Array.from(new Set((actions ?? []).map((a) => a.owner).filter((o): o is string => !!o))),
    [actions],
  );

  const todayStr  = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const weekEndStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const filtered = useMemo(() => {
    if (!actions) return [];
    return actions.filter((a) => {
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
    });
  }, [actions, ownerFilter, priorityFilter, mustWinOnly, overdueOnly, search, todayStr]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      GROUPS.map((g) => [g.key, [] as CommandCenterAction[]]),
    ) as Record<GroupKey, CommandCenterAction[]>;
    for (const a of filtered) map[classifyAction(a, todayStr, weekEndStr)].push(a);
    for (const g of GROUPS) {
      map[g.key].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
    }
    return map;
  }, [filtered, todayStr, weekEndStr]);

  const totalOpen = useMemo(
    () => (actions ?? []).filter((a) => a.status !== "Completed").length,
    [actions],
  );

  const overdueCount = useMemo(
    () => (actions ?? []).filter((a) => a.dueDate && a.dueDate < todayStr && a.status !== "Completed").length,
    [actions, todayStr],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Sticky compact header */}
      <div className="page-hero px-4 md:px-6 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold font-mono tracking-tight">Actions Command Center</h1>
              {!isLoading && totalOpen > 0 && (
                <span className="text-[11px] font-mono text-muted-foreground/60">{totalOpen} open</span>
              )}
              {overdueCount > 0 && (
                <span className="status-chip bg-destructive/10 text-destructive border-destructive/30">{overdueCount} overdue</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden md:block">Manage overdue, blocked, and upcoming execution items across the full inorganic growth pipeline.</p>
          </div>
        </div>

        {/* My Actions toggle */}
        {user && (
          <div className="flex items-center border border-border/60 rounded-lg overflow-hidden h-7 mb-1.5">
            <button
              onClick={() => setMineOnly(false)}
              className={`px-3 h-7 text-[11px] font-mono transition-colors ${
                !mineOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setMineOnly(true)}
              className={`px-3 h-7 text-[11px] font-mono transition-colors ${
                mineOnly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              Mine
            </button>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <div className="relative flex-1 min-w-[130px] max-w-[200px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-7 h-7 text-xs rounded-lg bg-card/60 border-border/60"
            />
          </div>

          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[120px] h-7 rounded-lg font-mono text-[11px] border-border/60">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[115px] h-7 rounded-lg font-mono text-[11px] border-border/60">
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
            className={`h-7 px-2.5 rounded-lg text-[11px] font-mono border transition-all duration-150 ${
              mustWinOnly
                ? "bg-primary/15 text-primary border-primary/40"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            Must-Win
          </button>

          <button
            onClick={() => setOverdueOnly((v) => !v)}
            className={`h-7 px-2.5 rounded-lg text-[11px] font-mono border transition-all duration-150 flex items-center gap-1.5 ${
              overdueOnly
                ? "bg-destructive text-white border-destructive"
                : "border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/40"
            }`}
          >
            <SlidersHorizontal size={12} />
            Overdue Only
          </button>
        </div>

        {/* Deal-type filter bar */}
        {availableDealTypes.length > 0 && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/40">
            <Filter size={11} className="text-muted-foreground/50 shrink-0" />
            <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider shrink-0">Deal Type</span>
            <Select value={dealTypeFilter || "_all"} onValueChange={(v) => setDealTypeFilter(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-6 text-[10px] font-mono rounded-md border-border/60 bg-background w-[160px] px-2">
                <SelectValue placeholder="All deal types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all" className="text-[11px] font-mono">All deal types</SelectItem>
                {availableDealTypes.map((dt) => (
                  <SelectItem key={dt} value={dt} className="text-[11px] font-mono">{dt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {dealTypeFilter && (
              <button
                onClick={() => setDealTypeFilter("")}
                className="text-[10px] font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors flex items-center gap-1"
              >
                <X size={10} /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-2.5">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ))
        ) : (
          GROUPS.map((g) => (
            <GroupSection
              key={g.key}
              group={g}
              actions={grouped[g.key] ?? []}
              todayStr={todayStr}
              onComplete={(id) => handleStatus(id, "Completed")}
              onReopen={(id) => handleStatus(id, "Open")}
              isPending={updateAction.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}
