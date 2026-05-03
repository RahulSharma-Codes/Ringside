import React, { useState } from "react";
import { Link } from "wouter";
import { useGetDiligenceReview } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardCheck, AlertTriangle, Clock, CheckCircle2,
  ChevronDown, ChevronRight, RefreshCw, ExternalLink,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const WORKSTREAM_COLORS: Record<string, string> = {
  Commercial: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Financial: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Legal: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Tax: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  HR: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Technology: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Operations: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  Integration: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

function wsChip(ws: string | null | undefined) {
  if (!ws) return null;
  const cls = WORKSTREAM_COLORS[ws] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-sm ${cls}`}>
      {ws}
    </Badge>
  );
}

function statusColor(status: string) {
  if (status === "Blocked") return "text-destructive";
  if (status === "Completed") return "text-emerald-500";
  if (status === "In Progress") return "text-primary";
  return "text-muted-foreground";
}

function priorityColor(priority: string) {
  if (priority === "Critical") return "text-destructive";
  if (priority === "High") return "text-amber-500";
  return "text-muted-foreground";
}

function tierBadge(tier: string | null | undefined) {
  if (!tier) return null;
  const cls =
    tier === "Must-Win" ? "border-destructive/30 text-destructive" :
    tier === "Priority 1" ? "border-amber-500/30 text-amber-500" :
    tier === "Priority 2" ? "border-primary/30 text-primary" :
    "border-border text-muted-foreground";
  return (
    <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-sm ${cls}`}>
      {tier}
    </Badge>
  );
}

function ReadinessBadge({ pct }: { pct: number }) {
  const cls =
    pct === 100 ? "text-emerald-500" :
    pct >= 60 ? "text-primary" :
    pct >= 30 ? "text-amber-500" :
    "text-destructive";
  return <span className={`font-mono font-bold text-sm ${cls}`}>{pct}%</span>;
}

type CollapsibleSection = {
  id: string;
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

function Section({ id, title, icon, count, children, defaultOpen = true }: CollapsibleSection) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-card/30 hover:bg-card/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="font-mono text-[11px] uppercase tracking-wider font-semibold">{title}</span>
          <Badge variant="outline" className="font-mono text-[9px] rounded-sm">{count}</Badge>
        </div>
        {open ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
      </button>
      {open && <div className="p-3 space-y-2 bg-background/20">{children}</div>}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-border rounded-sm py-8 text-center text-muted-foreground font-mono text-[10px] uppercase tracking-widest">
      {label}
    </div>
  );
}

export default function DiligenceReview() {
  const { data, isLoading, refetch, isFetching } = useGetDiligenceReview();
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const handleRefresh = () => {
    refetch();
    setLastRefresh(new Date());
  };

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">
      <div className="border-b border-border bg-sidebar/50 backdrop-blur-sm p-4 md:p-6 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-mono tracking-tight flex items-center gap-2">
              <ClipboardCheck size={20} className="text-primary" /> Diligence Review
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              Pipeline-wide due diligence status · refreshed {format(lastRefresh, "HH:mm")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-sm font-mono text-[10px] uppercase border-border gap-1.5"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-background">
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : !data ? (
            <div className="text-center text-muted-foreground py-20 font-mono text-sm">Failed to load diligence data</div>
          ) : (
            <>
              {/* Must-Win Incomplete */}
              <Section
                id="must-win"
                title="Must-Win with Incomplete Diligence"
                icon={<AlertTriangle size={14} />}
                count={data.mustWinIncomplete.length}
                defaultOpen={true}
              >
                {data.mustWinIncomplete.length === 0 ? (
                  <EmptyState label="All Must-Win targets have complete diligence" />
                ) : (
                  data.mustWinIncomplete.map((t) => (
                    <Link key={t.id} href={`/targets/${t.id}`}>
                      <div className="flex items-center justify-between p-3 border border-border rounded-sm bg-card/20 hover:bg-card/40 transition-colors cursor-pointer">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{t.projectName}</span>
                            {tierBadge(t.priorityTier)}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
                            <span>{t.targetCode}</span>
                            <span>{t.currentStage}</span>
                            {t.blocked > 0 && <span className="text-destructive">{t.blocked} blocked</span>}
                            {t.overdue > 0 && <span className="text-amber-500">{t.overdue} overdue</span>}
                            {t.missingWorkstreams.length > 0 && (
                              <span>{t.missingWorkstreams.length} workstreams missing</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <ReadinessBadge pct={t.pct} />
                            <div className="text-[9px] font-mono text-muted-foreground">{t.completed}/{t.total}</div>
                          </div>
                          <ExternalLink size={12} className="text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </Section>

              {/* Blocked Items */}
              <Section
                id="blocked"
                title="Blocked Diligence Items"
                icon={<AlertTriangle size={14} className="text-destructive" />}
                count={data.blockedItems.length}
                defaultOpen={true}
              >
                {data.blockedItems.length === 0 ? (
                  <EmptyState label="No blocked diligence items" />
                ) : (
                  data.blockedItems.map((item) => (
                    <Link key={item.id} href={`/targets/${item.targetId}`}>
                      <div className="flex items-start gap-3 p-3 border border-border rounded-sm bg-card/20 hover:bg-card/40 transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {wsChip(item.workstream)}
                            <span className="text-[10px] font-mono text-destructive uppercase">Blocked</span>
                          </div>
                          <div className="text-sm font-medium truncate">{item.description}</div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
                            <span className="text-primary">{item.targetName}</span>
                            {item.owner && <span>{item.owner}</span>}
                            {item.dueDate && <span>Due {format(parseISO(item.dueDate), "MMM d")}</span>}
                          </div>
                        </div>
                        <ExternalLink size={12} className="text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </Link>
                  ))
                )}
              </Section>

              {/* Overdue Items */}
              <Section
                id="overdue"
                title="Overdue Diligence Items"
                icon={<Clock size={14} className="text-amber-500" />}
                count={data.overdueItems.length}
                defaultOpen={true}
              >
                {data.overdueItems.length === 0 ? (
                  <EmptyState label="No overdue diligence items" />
                ) : (
                  data.overdueItems.map((item) => (
                    <Link key={item.id} href={`/targets/${item.targetId}`}>
                      <div className="flex items-start gap-3 p-3 border border-border rounded-sm bg-card/20 hover:bg-card/40 transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {wsChip(item.workstream)}
                            <span className={`text-[10px] font-mono uppercase ${statusColor(item.status)}`}>{item.status}</span>
                            <span className={`text-[10px] font-mono uppercase ${priorityColor(item.priority)}`}>{item.priority}</span>
                          </div>
                          <div className="text-sm font-medium truncate">{item.description}</div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
                            <span className="text-primary">{item.targetName}</span>
                            {item.owner && <span>{item.owner}</span>}
                            {item.dueDate && (
                              <span className="text-amber-500 font-bold">⚠ Due {format(parseISO(item.dueDate), "MMM d")}</span>
                            )}
                          </div>
                        </div>
                        <ExternalLink size={12} className="text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </Link>
                  ))
                )}
              </Section>

              {/* Per-Target Completion */}
              <Section
                id="completion"
                title="Diligence Completion by Target"
                icon={<ClipboardCheck size={14} />}
                count={data.targetSummaries.length}
                defaultOpen={data.targetSummaries.length <= 10}
              >
                {data.targetSummaries.length === 0 ? (
                  <EmptyState label="No targets with diligence items yet" />
                ) : (
                  data.targetSummaries.map((t) => (
                    <Link key={t.id} href={`/targets/${t.id}`}>
                      <div className="flex items-center gap-3 p-3 border border-border rounded-sm bg-card/20 hover:bg-card/40 transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{t.projectName}</span>
                            {tierBadge(t.priorityTier)}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
                            <span>{t.targetCode}</span>
                            <span>{t.currentStage}</span>
                            {t.blocked > 0 && <span className="text-destructive">{t.blocked} blocked</span>}
                            {t.overdue > 0 && <span className="text-amber-500">{t.overdue} overdue</span>}
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden w-full">
                            <div
                              className={`h-full rounded-full transition-all ${t.pct === 100 ? "bg-emerald-500" : t.pct >= 60 ? "bg-primary" : t.pct >= 30 ? "bg-amber-500" : "bg-destructive"}`}
                              style={{ width: `${t.pct}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <ReadinessBadge pct={t.pct} />
                          <div className="text-[9px] font-mono text-muted-foreground">{t.completed}/{t.total}</div>
                        </div>
                        <ExternalLink size={12} className="text-muted-foreground shrink-0" />
                      </div>
                    </Link>
                  ))
                )}
              </Section>

              {/* Missing Workstreams */}
              <Section
                id="missing"
                title="Targets with Missing Workstreams"
                icon={<AlertTriangle size={14} />}
                count={data.targetSummaries.filter((t) => t.missingWorkstreams.length > 0).length}
                defaultOpen={false}
              >
                {data.targetSummaries.filter((t) => t.missingWorkstreams.length > 0).length === 0 ? (
                  <EmptyState label="All active targets cover all 8 workstreams" />
                ) : (
                  data.targetSummaries
                    .filter((t) => t.missingWorkstreams.length > 0)
                    .map((t) => (
                      <Link key={t.id} href={`/targets/${t.id}`}>
                        <div className="flex items-start gap-3 p-3 border border-border rounded-sm bg-card/20 hover:bg-card/40 transition-colors cursor-pointer">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="font-medium text-sm">{t.projectName}</span>
                              {tierBadge(t.priorityTier)}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {t.missingWorkstreams.map((ws) => (
                                <Badge key={ws} variant="outline" className="font-mono text-[9px] rounded-sm text-muted-foreground border-dashed">
                                  {ws}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <ExternalLink size={12} className="text-muted-foreground shrink-0 mt-1" />
                        </div>
                      </Link>
                    ))
                )}
              </Section>

              {/* Recently Completed */}
              <Section
                id="recent"
                title="Recently Completed (Last 14 Days)"
                icon={<CheckCircle2 size={14} className="text-emerald-500" />}
                count={data.recentlyCompleted.length}
                defaultOpen={false}
              >
                {data.recentlyCompleted.length === 0 ? (
                  <EmptyState label="No diligence items completed in the last 14 days" />
                ) : (
                  data.recentlyCompleted.map((item) => (
                    <Link key={item.id} href={`/targets/${item.targetId}`}>
                      <div className="flex items-start gap-3 p-3 border border-border rounded-sm bg-card/20 hover:bg-card/40 transition-colors cursor-pointer opacity-80">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {wsChip(item.workstream)}
                            <span className="text-[10px] font-mono text-emerald-500 uppercase">Completed</span>
                          </div>
                          <div className="text-sm font-medium line-through text-muted-foreground truncate">{item.description}</div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-muted-foreground flex-wrap">
                            <span className="text-primary no-underline">{item.targetName}</span>
                            {item.completedAt && <span>{format(parseISO(item.completedAt), "MMM d")}</span>}
                          </div>
                        </div>
                        <ExternalLink size={12} className="text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </Link>
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
