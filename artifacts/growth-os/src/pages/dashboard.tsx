import React, { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { AnimatedCounter } from "@/components/animated-page";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetTargetsByStage, getGetTargetsByStageQueryKey,
  useGetTopPriorityTargets, getGetTopPriorityTargetsQueryKey,
  useGetTargetsNeedingAttention, getGetTargetsNeedingAttentionQueryKey,
  useListTargets, getListTargetsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { computeAvgAssessedScore } from "@/lib/score-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, Target, TrendingUp, AlertOctagon, CheckCircle2,
  XCircle, ArrowRight, AlertTriangle, Clock, Zap, GitBranch, ListTodo,
  ArrowUp, ArrowDown, Minus, RefreshCw,
} from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { StageRail, PIPELINE_STAGE_ORDER } from "@/components/stage-rail";
import { StageChip } from "@/components/stage-chip";
import { HealthDot } from "@/components/health-dot";
import { useAuth } from "@/contexts/auth-context";
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from "recharts";

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

interface CommandCenterAction {
  id: number;
  targetId: number;
  description: string;
  owner: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  targetName: string;
  targetCode: string | null;
  priorityTier: string | null;
  currentStage: string;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const weekEndStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: velocityData } = useQuery({
    queryKey: ["dashboard-velocity"],
    queryFn: () => customFetch<{ weekLabel: string; count: number }[]>("/api/targets/velocity"),
    staleTime: 10 * 60 * 1000,
  });

  const { data: myActions } = useQuery({
    queryKey: ["my-open-actions-dashboard", user?.email],
    queryFn: () => customFetch<CommandCenterAction[]>("/api/actions/command-center?mine=true"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const myUrgentActions = useMemo(() => {
    if (!myActions) return [];
    return myActions
      .filter((a) => a.status !== "Completed" && (
        (a.dueDate && a.dueDate < todayStr) ||
        (a.dueDate && a.dueDate <= weekEndStr)
      ))
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 5);
  }, [myActions, todayStr, weekEndStr]);

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

  const avgAssessedScore = computeAvgAssessedScore(
    (allTargets ?? []).map((t) => ({
      strategicFitScore: t.strategicFitScore,
      synergyScore: t.synergyScore,
      financialAttractivenessScore: t.financialAttractivenessScore,
      processMaturityScore: t.processMaturityScore,
      riskPenaltyScore: t.riskPenaltyScore,
      currentStage: t.currentStage,
      priorityScore: t.priorityScore,
    }))
  );

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
    <div className="pb-20 md:pb-8">

      {/* Executive hero header */}
      <div className="page-hero-sticky px-4 md:px-8 pt-4 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="metadata-label text-primary/70">Manipal Group · Corporate Development</p>
            <h1 className="text-xl md:text-2xl font-bold font-sans tracking-tight mt-0.5">Dashboard</h1>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed hidden md:block font-sans">A leadership-ready view of active opportunities, execution risk, and pipeline movement.</p>
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
              <div className="metric-number"><AnimatedCounter value={summary?.activeTargets ?? 0} /></div>
              {(summary?.newDealsThisWeek ?? 0) > 0 ? (
                <p className="flex items-center gap-0.5 text-[9px] font-mono text-emerald-500 mt-1.5">
                  <ArrowUp size={9} />{summary!.newDealsThisWeek} new this week
                </p>
              ) : (
                <p className="flex items-center gap-0.5 text-[9px] font-mono text-muted-foreground/50 mt-1.5">
                  <Minus size={9} />no new this week
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="kpi-accent-red rounded-xl bg-card border-border/80 overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4 pt-5">
              <CardTitle className="metadata-label">Must-Win</CardTitle>
              <AlertOctagon size={14} className="text-destructive/70 shrink-0" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="metric-number text-destructive"><AnimatedCounter value={summary?.mustWinCount ?? 0} /></div>
              {(summary?.newMustWinThisWeek ?? 0) > 0 ? (
                <p className="flex items-center gap-0.5 text-[9px] font-mono text-amber-500 mt-1.5">
                  <ArrowUp size={9} />{summary!.newMustWinThisWeek} added · {summary?.priority1Count ?? 0} P1
                </p>
              ) : (
                <p className="metadata-label mt-1.5">+ {summary?.priority1Count ?? 0} Priority&nbsp;1</p>
              )}
            </CardContent>
          </Card>

          <Card className="kpi-accent-emerald rounded-xl bg-card border-border/80 overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4 pt-5">
              <CardTitle className="metadata-label">Avg Score</CardTitle>
              <TrendingUp size={14} className="text-emerald-500/70 shrink-0" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {loadingRecent ? (
                <div className="metric-number text-muted-foreground/30">—</div>
              ) : avgAssessedScore !== null ? (
                <div className="metric-number"><AnimatedCounter value={Math.round(avgAssessedScore)} /></div>
              ) : (
                <div className="metric-number text-muted-foreground/50 text-lg">—</div>
              )}
              <p className="flex items-center gap-0.5 text-[9px] font-mono text-muted-foreground/50 mt-1.5">
                <Minus size={9} />{avgAssessedScore !== null ? "assessed deals" : "pending assessment"}
              </p>
            </CardContent>
          </Card>

          <Card className="kpi-accent-amber rounded-xl bg-card border-border/80 overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4 pt-5">
              <CardTitle className="metadata-label">Open Actions</CardTitle>
              <AlertCircle size={14} className="text-amber-500/70 shrink-0" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="metric-number text-amber-500"><AnimatedCounter value={summary?.openActionsCount ?? 0} /></div>
              {(summary?.overdueActionsCount ?? 0) > 0 ? (
                <p className="flex items-center gap-0.5 text-[9px] font-mono text-destructive mt-1.5">
                  <ArrowDown size={9} />{summary!.overdueActionsCount} overdue
                </p>
              ) : (
                <p className="flex items-center gap-0.5 text-[9px] font-mono text-emerald-500 mt-1.5">
                  <Minus size={9} />none overdue
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* My Open Actions — personalized urgency strip */}
        {user && myUrgentActions.length > 0 && (
          <Card className="rounded-xl bg-card border-border/80 overflow-hidden">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ListTodo size={13} className="text-amber-500" />
                  My Open Actions
                </span>
                <Link href="/actions?mine=true">
                  <span className="text-[10px] font-mono text-primary hover:underline flex items-center gap-1 cursor-pointer">
                    See all <ArrowRight size={10} />
                  </span>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/40">
              {myUrgentActions.map((action) => {
                const isOverdue = action.dueDate && action.dueDate < todayStr;
                return (
                  <Link key={action.id} href={`/targets/${action.targetId}`}>
                    <div className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group cursor-pointer ${isOverdue ? "bg-destructive/3" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors leading-snug">
                          {action.description}
                        </div>
                        <div className="metadata-label mt-0.5 flex items-center gap-1.5">
                          <span>{action.targetName}</span>
                          {action.targetCode && <><span className="w-1 h-1 bg-border rounded-full" /><span className="font-mono text-muted-foreground/50">{action.targetCode}</span></>}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {action.dueDate && (
                          <span className={`text-[10px] font-mono flex items-center gap-1 ${isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                            {isOverdue && <AlertTriangle size={10} />}
                            <Clock size={10} />
                            {format(parseISO(action.dueDate), "MMM d")}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Pipeline Health tile — computed from allTargets */}
        {!loadingRecent && (allTargets ?? []).length > 0 && (() => {
          const healthy = (allTargets ?? []).filter((t) => (t as { healthScore?: string | null }).healthScore === "healthy").length;
          const watch   = (allTargets ?? []).filter((t) => (t as { healthScore?: string | null }).healthScore === "watch").length;
          const atRisk  = (allTargets ?? []).filter((t) => (t as { healthScore?: string | null }).healthScore === "at_risk").length;
          return (
            <Card className="rounded-xl bg-card border-border/80 overflow-hidden">
              <CardHeader className="pb-1 flex flex-row items-center justify-between space-y-0 p-4 pt-4">
                <CardTitle className="metadata-label">Pipeline Health</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-1">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <HealthDot score="healthy" />
                    <span className="font-mono font-bold text-lg text-emerald-500">{healthy}</span>
                    <span className="metadata-label">Healthy</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <HealthDot score="watch" />
                    <span className="font-mono font-bold text-lg text-amber-400">{watch}</span>
                    <span className="metadata-label">Watch</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <HealthDot score="at_risk" />
                    <span className={`font-mono font-bold text-lg ${atRisk > 0 ? "text-destructive" : "text-muted-foreground"}`}>{atRisk}</span>
                    <span className="metadata-label">At Risk</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Deal Intake Velocity sparkline */}
        {velocityData && velocityData.length > 0 && (
          <Card className="rounded-xl bg-card border-border/80 overflow-hidden">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-2"><TrendingUp size={13} /> Deal Intake Velocity</span>
                <span className="text-[10px] font-mono text-muted-foreground/40 normal-case">new deals · last 8 weeks</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pt-3 pb-3">
              <ResponsiveContainer width="100%" height={56}>
                <LineChart data={velocityData} margin={{ top: 4, right: 4, bottom: 0, left: -32 }}>
                  <XAxis
                    dataKey="weekLabel"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", opacity: 0.6 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 10,
                      padding: "4px 8px",
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                    itemStyle={{ fontSize: 10, color: "hsl(var(--primary))" }}
                    formatter={(val: number) => [val, "new deals"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1.5}
                    dot={{ r: 2.5, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

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
                  onStageClick={(stage) => navigate(`/pipeline?stage=${encodeURIComponent(stage)}`)}
                />
              ) : (
                <div className="flex h-24 items-center justify-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  No active targets in pipeline
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl bg-card border-border/80 flex flex-col overflow-hidden">
            <CardHeader className="p-4 pb-2 border-b border-border/40">
              <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider flex items-center gap-2">
                <Zap size={13} /> Top Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col px-0 pb-0 pt-0">
              {loadingTop ? (
                <div className="p-4 space-y-3">
                  {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : topTargets && topTargets.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/20">
                      <th className="text-left py-1.5 pl-4 pr-2 font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider w-5">#</th>
                      <th className="text-left py-1.5 px-2 font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider">Deal</th>
                      <th className="py-1.5 px-2 font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider hidden sm:table-cell text-center">Health</th>
                      <th className="text-left py-1.5 px-2 font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider hidden md:table-cell">Stage</th>
                      <th className="text-right py-1.5 px-2 font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider">Score</th>
                      <th className="text-right py-1.5 pl-2 pr-4 font-mono text-[9px] text-muted-foreground/50 uppercase tracking-wider hidden sm:table-cell">Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {topTargets.map((target, idx) => {
                      const days = (target as { daysInCurrentStage?: number | null }).daysInCurrentStage;
                      const health = (target as { healthScore?: string | null }).healthScore as "healthy" | "watch" | "at_risk" | null | undefined;
                      return (
                        <tr
                          key={target.id}
                          className="hover:bg-muted/20 transition-colors cursor-pointer group"
                          onClick={() => navigate(`/targets/${target.id}`)}
                          onKeyDown={(e) => e.key === "Enter" && navigate(`/targets/${target.id}`)}
                          tabIndex={0}
                          role="link"
                        >
                          <td className="py-2 pl-4 pr-2 font-mono text-[10px] text-muted-foreground/40">{idx + 1}</td>
                          <td className="py-2 px-2 min-w-0 max-w-0">
                            <div className="font-medium truncate group-hover:text-primary transition-colors leading-snug">{target.projectName}</div>
                            <div className={`text-[9px] font-mono mt-0.5 ${target.priorityTier === "Must-Win" ? "text-destructive font-bold" : "text-muted-foreground/60"}`}>
                              {target.priorityTier}
                            </div>
                          </td>
                          <td className="py-2 px-2 hidden sm:table-cell text-center">
                            <HealthDot score={health} />
                          </td>
                          <td className="py-2 px-2 hidden md:table-cell">
                            {target.currentStage && <StageChip stage={target.currentStage} size="xs" />}
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-primary text-sm">{Math.round(target.priorityScore)}</td>
                          <td className="py-2 pl-2 pr-4 text-right font-mono text-[10px] text-muted-foreground/50 hidden sm:table-cell">
                            {days != null ? `${days}d` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
              <div className="space-y-1.5">
                {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
              </div>
            ) : attentionTargets && attentionTargets.length > 0 ? (
              <Card className="rounded-xl bg-card border-border/80 overflow-hidden">
                <div className="divide-y divide-border/30">
                {attentionTargets.map((target) => (
                  <Link key={target.id} href={`/targets/${target.id}`}>
                    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors cursor-pointer group">
                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate group-hover:text-primary transition-colors leading-snug">{target.projectName}</div>
                          <div className="metadata-label mt-0.5 flex items-center gap-2">
                            <span className="font-mono text-muted-foreground/50">{target.targetCode}</span>
                            {target.currentStage && <StageChip stage={target.currentStage} size="xs" />}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {(target.flags as string[] | null | undefined)?.map((flag) => {
                            const fl = FLAG_LABELS[flag];
                            return fl ? (
                              <Badge key={flag} variant="outline" className={`font-mono text-[9px] uppercase rounded-sm px-1.5 py-0 h-4 ${fl.color}`}>
                                {fl.label}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </div>
                      <Badge className={`font-mono text-[10px] shrink-0 ${getTierColor(target.priorityTier)}`}>
                        {target.priorityTier}
                      </Badge>
                    </div>
                  </Link>
                ))}
                </div>
              </Card>
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
