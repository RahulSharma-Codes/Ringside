import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { useGetDiligenceReview } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardCheck, AlertTriangle, Clock, CheckCircle2,
  ChevronDown, ChevronRight, RefreshCw, ExternalLink, Filter, X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { StageChip } from "@/components/stage-chip";
import { EmptyState } from "@/components/empty-state";

// ── URL query string helpers ───────────────────────────────────────────────

function getUrlParam(key: string): string {
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

function setUrlParam(key: string, value: string) {
  const params = new URLSearchParams(window.location.search);
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
  const newUrl = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
  window.history.replaceState({}, "", newUrl);
}

// ── Helpers ────────────────────────────────────────────────────────────────

const WORKSTREAM_COLORS: Record<string, string> = {
  Commercial: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Financial:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Legal:      "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Tax:        "bg-orange-500/10 text-orange-400 border-orange-500/20",
  HR:         "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Technology: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Operations: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  Integration:"bg-violet-500/10 text-violet-400 border-violet-500/20",
};

function wsChip(ws: string | null | undefined) {
  if (!ws) return null;
  const cls = WORKSTREAM_COLORS[ws] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-md ${cls}`}>
      {ws}
    </Badge>
  );
}

function statusColor(status: string) {
  if (status === "Blocked")     return "text-destructive";
  if (status === "Completed")   return "text-emerald-500";
  if (status === "In Progress") return "text-primary";
  return "text-muted-foreground";
}

function priorityColor(priority: string) {
  if (priority === "Critical") return "text-destructive";
  if (priority === "High")     return "text-amber-500";
  return "text-muted-foreground";
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  "JV": "JV",
  "Partnership": "Partner",
  "Strategic Alliance": "Alliance",
};

function dealTypeBadge(dealType: string | null | undefined) {
  if (!dealType) return null;
  const label = DEAL_TYPE_LABELS[dealType];
  if (!label) return null;
  return (
    <Badge variant="outline" className="font-mono text-[9px] uppercase rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30">
      {label}
    </Badge>
  );
}

function tierBadge(tier: string | null | undefined) {
  if (!tier) return null;
  const cls =
    tier === "Must-Win"   ? "border-destructive/30 text-destructive" :
    tier === "Priority 1" ? "border-amber-500/30 text-amber-500" :
    tier === "Priority 2" ? "border-primary/30 text-primary" :
    "border-border text-muted-foreground";
  return (
    <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-md ${cls}`}>
      {tier}
    </Badge>
  );
}

function ReadinessBadge({ pct }: { pct: number }) {
  const cls =
    pct === 100 ? "text-emerald-500" :
    pct >= 60   ? "text-primary" :
    pct >= 30   ? "text-amber-500" :
    "text-destructive";
  return <span className={`font-mono font-bold text-base ${cls}`}>{pct}%</span>;
}

function ItemRow({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link href={href}>
      <div className="flex items-start gap-3 p-3.5 border border-border/50 rounded-xl bg-card hover:bg-muted/20 hover:shadow-sm transition-all duration-150 cursor-pointer group">
        {children}
      </div>
    </Link>
  );
}

type CollapsibleSection = {
  id: string;
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  urgency?: "high" | "medium";
};

function Section({ id: _id, title, icon, count, children, defaultOpen = true, urgency }: CollapsibleSection) {
  const [open, setOpen] = useState(defaultOpen);
  const headerCls =
    urgency === "high"   ? "group-header-overdue" :
    urgency === "medium" ? "group-header-thisweek" :
    "";

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <button
        className={`section-header rounded-t-xl ${headerCls}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-muted-foreground/70 shrink-0">{icon}</span>
        <span className="font-mono text-[11px] uppercase tracking-wider font-semibold flex-1 text-left">
          {title}
        </span>
        <Badge
          variant="outline"
          className={`font-mono text-[9px] rounded-md shrink-0 ${
            urgency === "high" && count > 0 ? "bg-destructive/10 text-destructive border-destructive/30" :
            urgency === "medium" && count > 0 ? "bg-amber-500/10 text-amber-500 border-amber-500/30" :
            ""
          }`}
        >
          {count}
        </Badge>
        {open
          ? <ChevronDown size={13} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="p-3 space-y-2 border-t border-border/40 bg-background/20">
          {children}
        </div>
      )}
    </div>
  );
}


interface FiltersData {
  dealTypes: string[];
}

export default function DiligenceReview() {
  const [dealTypeFilter, setDealTypeFilter] = useState(() => getUrlParam("dealType"));
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  // Sync dealType filter to URL
  useEffect(() => {
    setUrlParam("dealType", dealTypeFilter);
  }, [dealTypeFilter]);

  const diligenceParams = dealTypeFilter ? { dealType: dealTypeFilter } : {};
  const { data, isLoading, refetch, isFetching } = useGetDiligenceReview(diligenceParams);

  // Fetch available deal types for the filter dropdown
  const { data: filtersData } = useQuery({
    queryKey: ["targets-filters"],
    queryFn: () => customFetch<FiltersData>("/api/targets/filters"),
    staleTime: 5 * 60 * 1000,
  });
  const availableDealTypes = filtersData?.dealTypes ?? [];

  const handleRefresh = () => {
    refetch();
    setLastRefresh(new Date());
  };

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">
      {/* Sticky header */}
      <div className="page-hero px-4 md:px-6 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ClipboardCheck size={16} className="text-primary shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold font-sans tracking-tight">Diligence Review</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 hidden md:block font-sans">Monitor diligence readiness, workstream coverage, overdue items, and blocked issues across active opportunities.</p>
            </div>
            <span className="metadata-label text-muted-foreground/40 hidden sm:inline mt-1">
              refreshed {format(lastRefresh, "HH:mm")}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl font-sans text-[11px] gap-1.5 border-border/60 shrink-0 h-7 px-2.5"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {/* Deal-type filter bar */}
        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border/40">
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
            <button
              onClick={() => setDealTypeFilter("")}
              className="text-[10px] font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors flex items-center gap-1"
            >
              <X size={10} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-background">
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-2.5">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : !data ? (
            <div className="text-center text-muted-foreground py-20 font-mono text-sm">
              Failed to load diligence data
            </div>
          ) : (
            <>
              {/* Must-Win Incomplete */}
              <Section
                id="must-win"
                title="Must-Win with Incomplete Diligence"
                icon={<AlertTriangle size={13} className={data.mustWinIncomplete.length > 0 ? "text-destructive" : ""} />}
                count={data.mustWinIncomplete.length}
                defaultOpen={true}
                urgency="high"
              >
                {data.mustWinIncomplete.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="All Must-Win targets have complete diligence" size="sm" />
                ) : (
                  data.mustWinIncomplete.map((t) => (
                    <ItemRow key={t.id} href={`/targets/${t.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{t.projectName}</span>
                          {tierBadge(t.priorityTier)}
                          {dealTypeBadge(t.dealType)}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
                          <span>{t.targetCode}</span>
                          <StageChip stage={t.currentStage} size="xs" />
                          {t.blocked > 0 && <span className="text-destructive font-semibold">{t.blocked} blocked</span>}
                          {t.overdue > 0 && <span className="text-amber-500 font-semibold">{t.overdue} overdue</span>}
                          {t.missingWorkstreams.length > 0 && (
                            <span>{t.missingWorkstreams.length} workstream{t.missingWorkstreams.length !== 1 ? "s" : ""} missing</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <ReadinessBadge pct={t.pct} />
                          <div className="text-[9px] font-mono text-muted-foreground">{t.completed}/{t.total}</div>
                        </div>
                        <ExternalLink size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                      </div>
                    </ItemRow>
                  ))
                )}
              </Section>

              {/* Blocked Items */}
              <Section
                id="blocked"
                title="Blocked Diligence Items"
                icon={<AlertTriangle size={13} className={data.blockedItems.length > 0 ? "text-destructive" : ""} />}
                count={data.blockedItems.length}
                defaultOpen={true}
                urgency="high"
              >
                {data.blockedItems.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="No blocked diligence items" size="sm" />
                ) : (
                  data.blockedItems.map((item) => (
                    <ItemRow key={item.id} href={`/targets/${item.targetId}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {wsChip(item.workstream)}
                          <span className="text-[10px] font-mono text-destructive uppercase font-semibold">Blocked</span>
                        </div>
                        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{item.description}</div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
                          <span className="text-primary">{item.targetName}</span>
                          {dealTypeBadge(item.dealType)}
                          {item.owner && <span>{item.owner}</span>}
                          {item.dueDate && <span>Due {format(parseISO(item.dueDate), "MMM d")}</span>}
                        </div>
                      </div>
                      <ExternalLink size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors" />
                    </ItemRow>
                  ))
                )}
              </Section>

              {/* Overdue Items */}
              <Section
                id="overdue"
                title="Overdue Diligence Items"
                icon={<Clock size={13} className={data.overdueItems.length > 0 ? "text-amber-500" : ""} />}
                count={data.overdueItems.length}
                defaultOpen={true}
                urgency="medium"
              >
                {data.overdueItems.length === 0 ? (
                  <EmptyState icon={Clock} title="No overdue diligence items" size="sm" />
                ) : (
                  data.overdueItems.map((item) => (
                    <ItemRow key={item.id} href={`/targets/${item.targetId}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {wsChip(item.workstream)}
                          <span className={`text-[10px] font-mono uppercase font-semibold ${statusColor(item.status)}`}>{item.status}</span>
                          <span className={`text-[10px] font-mono uppercase ${priorityColor(item.priority)}`}>{item.priority}</span>
                        </div>
                        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{item.description}</div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
                          <span className="text-primary">{item.targetName}</span>
                          {dealTypeBadge(item.dealType)}
                          {item.owner && <span>{item.owner}</span>}
                          {item.dueDate && (
                            <span className="text-amber-500 font-semibold flex items-center gap-1">
                              <AlertTriangle size={9} /> Due {format(parseISO(item.dueDate), "MMM d")}
                            </span>
                          )}
                        </div>
                      </div>
                      <ExternalLink size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors" />
                    </ItemRow>
                  ))
                )}
              </Section>

              {/* Per-Target Completion */}
              <Section
                id="completion"
                title="Diligence Completion by Target"
                icon={<ClipboardCheck size={13} />}
                count={data.targetSummaries.length}
                defaultOpen={data.targetSummaries.length <= 10}
              >
                {data.targetSummaries.length === 0 ? (
                  <EmptyState icon={ClipboardCheck} title="No targets with diligence items yet" size="sm" />
                ) : (
                  data.targetSummaries.map((t) => (
                    <ItemRow key={t.id} href={`/targets/${t.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{t.projectName}</span>
                          {tierBadge(t.priorityTier)}
                          {dealTypeBadge(t.dealType)}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
                          <span>{t.targetCode}</span>
                          <StageChip stage={t.currentStage} size="xs" />
                          {t.blocked > 0 && <span className="text-destructive font-semibold">{t.blocked} blocked</span>}
                          {t.overdue > 0 && <span className="text-amber-500 font-semibold">{t.overdue} overdue</span>}
                        </div>
                        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden w-full">
                          <div
                            className={`h-full rounded-full transition-all ${
                              t.pct === 100 ? "bg-emerald-500" :
                              t.pct >= 60   ? "bg-primary" :
                              t.pct >= 30   ? "bg-amber-500" :
                              "bg-destructive"
                            }`}
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <ReadinessBadge pct={t.pct} />
                        <div className="text-[9px] font-mono text-muted-foreground">{t.completed}/{t.total}</div>
                      </div>
                      <ExternalLink size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors" />
                    </ItemRow>
                  ))
                )}
              </Section>

              {/* Missing Workstreams */}
              <Section
                id="missing"
                title="Targets with Missing Workstreams"
                icon={<AlertTriangle size={13} />}
                count={data.targetSummaries.filter((t) => t.missingWorkstreams.length > 0).length}
                defaultOpen={false}
              >
                {data.targetSummaries.filter((t) => t.missingWorkstreams.length > 0).length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="All active targets cover all 8 workstreams" size="sm" />
                ) : (
                  data.targetSummaries
                    .filter((t) => t.missingWorkstreams.length > 0)
                    .map((t) => (
                      <ItemRow key={t.id} href={`/targets/${t.id}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="font-semibold text-sm group-hover:text-primary transition-colors">{t.projectName}</span>
                            {tierBadge(t.priorityTier)}
                            {dealTypeBadge(t.dealType)}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {t.missingWorkstreams.map((ws) => (
                              <Badge
                                key={ws}
                                variant="outline"
                                className="font-mono text-[9px] rounded-md text-muted-foreground border-dashed"
                              >
                                {ws}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <ExternalLink size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors" />
                      </ItemRow>
                    ))
                )}
              </Section>

              {/* Recently Completed */}
              <Section
                id="recent"
                title="Recently Completed (Last 14 Days)"
                icon={<CheckCircle2 size={13} className="text-emerald-500" />}
                count={data.recentlyCompleted.length}
                defaultOpen={false}
              >
                {data.recentlyCompleted.length === 0 ? (
                  <EmptyState icon={Clock} title="No diligence items completed in the last 14 days" size="sm" />
                ) : (
                  data.recentlyCompleted.map((item) => (
                    <ItemRow key={item.id} href={`/targets/${item.targetId}`}>
                      <div className="flex-1 min-w-0 opacity-75">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {wsChip(item.workstream)}
                          <span className="text-[10px] font-mono text-emerald-500 uppercase font-semibold">Completed</span>
                        </div>
                        <div className="text-sm font-medium line-through text-muted-foreground truncate">
                          {item.description}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
                          <span className="text-primary no-underline">{item.targetName}</span>
                          {dealTypeBadge(item.dealType)}
                          {item.completedAt && <span>{format(parseISO(item.completedAt), "MMM d")}</span>}
                        </div>
                      </div>
                      <ExternalLink size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors" />
                    </ItemRow>
                  ))
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
