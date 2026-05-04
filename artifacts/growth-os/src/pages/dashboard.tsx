import React from "react";
import { Link } from "wouter";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetTargetsByStage, getGetTargetsByStageQueryKey,
  useGetTopPriorityTargets, getGetTopPriorityTargetsQueryKey,
  useGetTargetsNeedingAttention, getGetTargetsNeedingAttentionQueryKey,
  useListTargets, getListTargetsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, Target, TrendingUp, AlertOctagon, CheckCircle2,
  XCircle, ArrowRight, AlertTriangle, Clock, Zap, RefreshCw, GitBranch,
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { StageRail, PIPELINE_STAGE_ORDER } from "@/components/stage-rail";
import { StageChip } from "@/components/stage-chip";

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  overdue_action:       { label: "Overdue Action",       color: "text-destructive border-destructive/30" },
  no_recent_interaction:{ label: "No Recent Interaction", color: "text-amber-500 border-amber-500/30" },
  must_win_no_action:   { label: "Must-Win / No Action",  color: "text-destructive border-destructive/30" },
  stale_stage:          { label: "Stale Stage",           color: "text-orange-500 border-orange-500/30" },
};

function getTierColor(tier: string) {
  switch (tier) {
    case "Must-Win":   return "bg-destructive text-destructive-foreground border-0";
    case "Priority 1": return "bg-amber-500 text-white border-0";
    case "Priority 2": return "bg-primary text-primary-foreground border-0";
    default:           return "bg-muted text-muted-foreground";
  }
}

function SectionLabel({ icon, label, children }: { icon: React.ReactNode; label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground/70">{icon}</span>
      <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });

  const { data: stageData, isLoading: loadingStages } = useGetTargetsByStage({
    query: { queryKey: getGetTargetsByStageQueryKey() },
  });

  const { data: topTargets, isLoading: loadingTop } = useGetTopPriorityTargets(
    { limit: 5 },
    { query: { queryKey: getGetTopPriorityTargetsQueryKey({ limit: 5 }) } },
  );

  const { data: attentionTargets, isLoading: loadingAttention } = useGetTargetsNeedingAttention({
    query: { queryKey: getGetTargetsNeedingAttentionQueryKey() },
  });

  const { data: allTargets, isLoading: loadingRecent } = useListTargets(
    { isActive: true },
    { query: { queryKey: getListTargetsQueryKey({ isActive: true }) } },
  );
  const recentlyUpdated = (allTargets ?? []).slice(0, 5);

  const totalActive = (stageData ?? []).reduce((sum, s) => sum + (s.count ?? 0), 0);
  const distributionItems = (stageData ?? []).map((s) => ({
    stage: s.stage,
    count: s.count ?? 0,
    hasFlagged: false,
  }));

  const attentionStages = new Set(
    (attentionTargets ?? []).map((t) => t.currentStage).filter(Boolean)
  );
  const distributionWithFlags = distributionItems.map((item) => ({
    ...item,
    hasFlagged: attentionStages.has(item.stage),
  }));

  if (loadingSummary) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div className="h-24 w-full bg-muted rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-20 md:pb-8">

      {/* Executive hero header */}
      <div className="page-hero-sticky px-4 md:px-8 pt-4 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="metadata-label text-primary/80">Ringside</p>
            <h1 className="text-xl md:text-2xl font-bold font-mono tracking-tight mt-0.5">Ringside Dashboard</h1>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed hidden md:block">A leadership-ready view of active opportunities, execution risk, and pipeline movement.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(summary?.needsAttentionCount ?? 0) > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 bg-destructive/10 border border-destructive/25 rounded-lg px-2.5 py-1.5">
                <AlertTriangle size={11} className="text-destructive shrink-0" />
                <span className="text-[10px] font-mono text-destructive font-semibold">
                  {summary!.needsAttentionCount} flagged
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[10px] font-mono text-emerald-400/90 uppercase tracking-wider hidden sm:inline">Live</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6">

        {/* Primary KPI row — 2-up on mobile, 4-up on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <Card className="kpi-accent-blue rounded-xl bg-card border-border/80 overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4 pt-5">
              <CardTitle className="metadata-label">Active</CardTitle>
              <Target size={14} className="text-primary/70 shrink-0" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="metric-number">{summary?.activeTargets ?? 0}</div>
              <p className="metadata-label mt-1.5">opportunities</p>
            </CardContent>
          </Card>

          <Card className="kpi-accent-red rounded-xl bg-card border-border/80 overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4 pt-5">
              <CardTitle className="metadata-label">Must-Win</CardTitle>
              <AlertOctagon size={14} className="text-destructive/70 shrink-0" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="metric-number text-destructive">{summary?.mustWinCount ?? 0}</div>
              <p className="metadata-label mt-1.5">+ {summary?.priority1Count ?? 0} Priority&nbsp;1</p>
            </CardContent>
          </Card>

          <Card className="kpi-accent-emerald rounded-xl bg-card border-border/80 overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4 pt-5">
              <CardTitle className="metadata-label">Avg Score</CardTitle>
              <TrendingUp size={14} className="text-emerald-500/70 shrink-0" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="metric-number">{Math.round(summary?.avgPriorityScore ?? 0)}</div>
              <p className="metadata-label mt-1.5">out of 100</p>
            </CardContent>
          </Card>

          <Card className="kpi-accent-amber rounded-xl bg-card border-border/80 overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4 pt-5">
              <CardTitle className="metadata-label">Open Actions</CardTitle>
              <AlertCircle size={14} className="text-amber-500/70 shrink-0" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="metric-number text-amber-500">{summary?.openActionsCount ?? 0}</div>
              <p className="metadata-label mt-1.5">{summary?.overdueActionsCount ?? 0} overdue</p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary KPI strip — compact 3-stat bar */}
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {[
            {
              label: "Needs Attention",
              value: summary?.needsAttentionCount ?? 0,
              cls: (summary?.needsAttentionCount ?? 0) > 0 ? "text-destructive" : "text-muted-foreground",
              accent: (summary?.needsAttentionCount ?? 0) > 0 ? "kpi-accent-red" : "kpi-accent-muted",
              icon: <AlertTriangle size={13} className={(summary?.needsAttentionCount ?? 0) > 0 ? "text-destructive/70" : "text-muted-foreground/40"} />,
              sub: "flagged",
            },
            {
              label: "Closed",
              value: summary?.closedDealsCount ?? 0,
              cls: "text-emerald-500",
              accent: "kpi-accent-emerald",
              icon: <CheckCircle2 size={13} className="text-emerald-500/70" />,
              sub: "closed",
            },
            {
              label: "Dropped",
              value: summary?.droppedDealsCount ?? 0,
              cls: "text-muted-foreground",
              accent: "kpi-accent-muted",
              icon: <XCircle size={13} className="text-muted-foreground/50" />,
              sub: "dropped",
            },
          ].map((s) => (
            <Card key={s.label} className={`${s.accent} rounded-xl bg-card border-border/70 overflow-hidden`}>
              <CardContent className="p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="metadata-label">{s.label}</span>
                  {s.icon}
                </div>
                <div className={`font-mono font-bold text-2xl tracking-tight leading-none ${s.cls}`}>{s.value}</div>
                <p className="metadata-label mt-1">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stage Distribution Board + Top Opportunities */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 rounded-xl bg-card border-border/80 overflow-hidden">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider flex items-center gap-2">
                <GitBranch size={13} />
                Pipeline Stage Distribution
              </CardTitle>
              <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono leading-relaxed">
                Stage distribution across active opportunities, highlighting where execution attention is concentrated.
              </p>
            </CardHeader>
            <CardContent className="px-4 pt-4 pb-4">
              {loadingStages ? (
                <Skeleton className="w-full h-24" />
              ) : (distributionWithFlags.some((s) => s.count > 0)) ? (
                <StageRail
                  mode="distribution"
                  stages={distributionWithFlags}
                  totalActive={totalActive}
                />
              ) : (
                <div className="flex h-24 items-center justify-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  No active targets in pipeline
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl bg-card border-border/80 flex flex-col">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-2"><Zap size={13} /> Top Opportunities</span>
                <Badge variant="outline" className="font-mono text-[10px]">Score</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-0 px-0 pb-0">
              {loadingTop ? (
                <div className="p-4 space-y-3">
                  {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : topTargets && topTargets.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {topTargets.map((target, idx) => (
                    <Link key={target.id} href={`/targets/${target.id}`}>
                      <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors group cursor-pointer">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-[10px] font-mono text-muted-foreground/50 w-4 shrink-0">{idx + 1}</span>
                          <div className="overflow-hidden min-w-0">
                            <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{target.projectName}</div>
                            <div className="metadata-label truncate flex items-center gap-2">
                              <span className={target.priorityTier === "Must-Win" ? "text-destructive font-bold" : ""}>{target.priorityTier}</span>
                              {target.sector && <><span className="w-1 h-1 bg-border rounded-full shrink-0" /><span>{target.sector}</span></>}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm font-mono font-bold text-primary shrink-0 ml-2">{Math.round(target.priorityScore)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-xs font-mono text-muted-foreground uppercase tracking-widest text-center">
                  No evaluated targets
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Needs Attention */}
        {(loadingAttention || (attentionTargets?.length ?? 0) > 0) && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-destructive" />
                <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">Needs Attention</h2>
              </div>
              {(attentionTargets?.length ?? 0) > 0 && (
                <Badge className="font-mono text-[10px] bg-destructive text-destructive-foreground border-0">
                  {attentionTargets!.length}
                </Badge>
              )}
            </div>

            {loadingAttention ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : attentionTargets && attentionTargets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {attentionTargets.map((target) => (
                  <Link key={target.id} href={`/targets/${target.id}`}>
                    <Card className="bg-destructive/5 border-destructive/25 rounded-xl hover:bg-destructive/8 transition-colors cursor-pointer border-l-[3px] border-l-destructive">
                      <CardContent className="p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm truncate">{target.projectName}</div>
                            <div className="metadata-label mt-0.5 flex items-center gap-2">
                              <span>{target.targetCode}</span>
                              {target.currentStage && (
                                <><span className="w-1 h-1 bg-border rounded-full" />
                                <StageChip stage={target.currentStage} size="xs" /></>
                              )}
                            </div>
                          </div>
                          <Badge className={`font-mono text-[10px] shrink-0 ${getTierColor(target.priorityTier)}`}>
                            {target.priorityTier}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {(target as { flags?: string[] }).flags?.map((flag) => {
                            const info = FLAG_LABELS[flag];
                            return info ? (
                              <Badge
                                key={flag}
                                variant="outline"
                                className={`font-mono text-[9px] uppercase ${info.color}`}
                              >
                                {info.label}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* All clear */}
        {!loadingAttention && (attentionTargets?.length ?? 0) === 0 && (
          <Card className="bg-emerald-500/5 border-emerald-500/20 rounded-xl">
            <CardContent className="p-5 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-400">All opportunities on track</p>
                <p className="metadata-label mt-0.5">No attention flags across the active pipeline</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recently Updated */}
        <div className="space-y-3">
          <SectionLabel icon={<RefreshCw size={13} />} label="Recently Updated">
            {(summary?.recentlyUpdatedCount ?? 0) > 0 && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {summary!.recentlyUpdatedCount} in 7d
              </Badge>
            )}
          </SectionLabel>

          {loadingRecent ? (
            <div className="space-y-2">
              {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : recentlyUpdated.length > 0 ? (
            <Card className="bg-card border-border/80 rounded-xl overflow-hidden">
              <CardContent className="p-0 divide-y divide-border/50">
                {recentlyUpdated.map((target) => (
                  <Link key={target.id} href={`/targets/${target.id}`}>
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors group cursor-pointer">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{target.projectName}</div>
                        <div className="metadata-label flex items-center gap-2 mt-0.5">
                          <span>{target.targetCode}</span>
                          {target.sector && <><span className="w-1 h-1 bg-border rounded-full" /><span>{target.sector}</span></>}
                          {target.currentStage && <><span className="w-1 h-1 bg-border rounded-full" /><StageChip stage={target.currentStage} size="xs" /></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                          <Clock size={10} />
                          {target.updatedAt
                            ? formatDistanceToNow(parseISO(target.updatedAt), { addSuffix: true })
                            : "—"}
                        </div>
                        <ArrowRight size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card border-border/80 rounded-xl">
              <CardContent className="p-6 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
                No active targets
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
