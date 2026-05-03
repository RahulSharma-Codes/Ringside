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
  XCircle, ArrowRight, AlertTriangle, Clock, Zap, RefreshCw,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO, formatDistanceToNow } from "date-fns";

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  overdue_action:       { label: "Overdue Action",       color: "text-destructive border-destructive/30" },
  no_recent_interaction:{ label: "No Recent Interaction", color: "text-amber-500 border-amber-500/30" },
  must_win_no_action:   { label: "Must-Win / No Action",  color: "text-destructive border-destructive/30" },
  stale_stage:          { label: "Stale Stage",           color: "text-orange-500 border-orange-500/30" },
};

function getTierColor(tier: string) {
  switch (tier) {
    case "Must-Win": return "bg-destructive text-destructive-foreground";
    case "Priority 1": return "bg-amber-500 text-white";
    case "Priority 2": return "bg-primary text-primary-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

function BarChart3({ size, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const s = size ?? 24;
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width={s} height={s}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
    </svg>
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

  // Recently updated: top 5 by updatedAt (list endpoint already orders by updatedAt desc)
  const { data: allTargets, isLoading: loadingRecent } = useListTargets(
    { isActive: true },
    { query: { queryKey: getListTargetsQueryKey({ isActive: true }) } },
  );
  const recentlyUpdated = (allTargets ?? []).slice(0, 5);

  if (loadingSummary) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Executive Summary</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500 pb-20 md:pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Executive Summary</h1>
          <p className="text-sm text-muted-foreground">Live M&A pipeline intelligence</p>
        </div>
        <div className="text-xs font-mono text-muted-foreground bg-muted/50 px-3 py-1 rounded-sm border border-border">
          SYSTEM STATUS: LIVE
        </div>
      </div>

      {/* KPI Cards — 2-column on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4">
            <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Active</CardTitle>
            <Target size={13} className="text-primary shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="text-2xl font-mono">{summary?.activeTargets ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-mono">opportunities</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4">
            <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Must-Win</CardTitle>
            <AlertOctagon size={13} className="text-destructive shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="text-2xl font-mono text-destructive">{summary?.mustWinCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-mono">+ {summary?.priority1Count ?? 0} P1</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4">
            <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Avg Score</CardTitle>
            <TrendingUp size={13} className="text-emerald-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="text-2xl font-mono">{Math.round(summary?.avgPriorityScore ?? 0)}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-mono">out of 100</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border rounded-sm border-l-2 border-l-amber-500">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4">
            <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Actions</CardTitle>
            <AlertCircle size={13} className="text-amber-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="text-2xl font-mono text-amber-500">{summary?.openActionsCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-mono">
              {summary?.overdueActionsCount ?? 0} overdue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Second KPI row — attention + closed/dropped */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <Card className={`bg-card/50 backdrop-blur border-border rounded-sm ${(summary?.needsAttentionCount ?? 0) > 0 ? "border-l-2 border-l-destructive" : ""}`}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4">
            <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Needs Attention</CardTitle>
            <AlertTriangle size={13} className={(summary?.needsAttentionCount ?? 0) > 0 ? "text-destructive shrink-0" : "text-muted-foreground shrink-0"} />
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className={`text-2xl font-mono ${(summary?.needsAttentionCount ?? 0) > 0 ? "text-destructive" : ""}`}>
              {summary?.needsAttentionCount ?? 0}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-mono">flagged</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4">
            <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Closed</CardTitle>
            <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="text-2xl font-mono">{summary?.closedDealsCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-mono">deals</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border rounded-sm col-span-2 md:col-span-1">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 p-4">
            <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Dropped</CardTitle>
            <XCircle size={13} className="text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="text-2xl font-mono text-muted-foreground">{summary?.droppedDealsCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-mono">deals</p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline chart + Top Opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase font-mono tracking-wider flex items-center gap-2">
              <BarChart3 size={14} />
              Pipeline Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] px-2">
            {loadingStages ? (
              <Skeleton className="w-full h-full" />
            ) : stageData && stageData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageData} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="stage"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9, fontFamily: "var(--app-font-mono)" }}
                    tickLine={false}
                    axisLine={false}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--app-font-mono)" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted)/0.5)" }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "2px",
                      fontFamily: "var(--app-font-mono)",
                      fontSize: "12px",
                      color: "hsl(var(--popover-foreground))",
                    }}
                    itemStyle={{ color: "hsl(var(--primary))" }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm font-mono text-muted-foreground uppercase tracking-widest">
                No active targets in pipeline
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-border rounded-sm flex flex-col">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase font-mono tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-2"><Zap size={13} /> Top Opportunities</span>
              <Badge variant="outline" className="font-mono text-[10px] rounded-sm">Score</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-3 px-4 pb-4">
            {loadingTop ? (
              Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : topTargets && topTargets.length > 0 ? (
              topTargets.map((target) => (
                <div key={target.id} className="flex items-center justify-between group">
                  <div className="overflow-hidden min-w-0">
                    <Link href={`/targets/${target.id}`} className="hover:underline underline-offset-4 text-sm font-medium truncate block">
                      {target.projectName}
                    </Link>
                    <div className="text-[10px] text-muted-foreground font-mono truncate uppercase flex items-center gap-2">
                      <span className={target.priorityTier === "Must-Win" ? "text-destructive font-bold" : ""}>{target.priorityTier}</span>
                      {target.sector && <><span className="w-1 h-1 bg-border rounded-full shrink-0" /><span>{target.sector}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <div className="text-sm font-mono font-bold text-primary">{Math.round(target.priorityScore)}</div>
                    <Link href={`/targets/${target.id}`}>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight size={13} />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex h-full items-center justify-center text-xs font-mono text-muted-foreground uppercase tracking-widest text-center">
                No evaluated targets
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Needs Attention */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-destructive" />
          <h2 className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">Needs Attention</h2>
          {(attentionTargets?.length ?? 0) > 0 && (
            <Badge className="font-mono text-[10px] rounded-sm bg-destructive text-destructive-foreground">
              {attentionTargets!.length}
            </Badge>
          )}
        </div>
        {loadingAttention ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : attentionTargets && attentionTargets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attentionTargets.map((target) => (
              <Link key={target.id} href={`/targets/${target.id}`}>
                <Card className="bg-card/50 backdrop-blur border-border rounded-sm hover:bg-card/80 transition-colors cursor-pointer border-l-2 border-l-destructive">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{target.projectName}</div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase mt-0.5 flex items-center gap-2">
                          <span>{target.targetCode}</span>
                          {target.currentStage && (
                            <><span className="w-1 h-1 bg-border rounded-full" /><span>{target.currentStage}</span></>
                          )}
                        </div>
                      </div>
                      <Badge className={`font-mono text-[10px] rounded-sm shrink-0 ${getTierColor(target.priorityTier)}`}>
                        {target.priorityTier}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(target as { flags?: string[] }).flags?.map((flag) => {
                        const info = FLAG_LABELS[flag];
                        return info ? (
                          <Badge
                            key={flag}
                            variant="outline"
                            className={`font-mono text-[9px] uppercase rounded-sm ${info.color}`}
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
        ) : (
          <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
            <CardContent className="p-6 text-center">
              <CheckCircle2 size={20} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                All opportunities on track
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recently Updated */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw size={13} className="text-muted-foreground" />
          <h2 className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">Recently Updated</h2>
          {(summary?.recentlyUpdatedCount ?? 0) > 0 && (
            <Badge variant="outline" className="font-mono text-[10px] rounded-sm">
              {summary!.recentlyUpdatedCount} in 7d
            </Badge>
          )}
        </div>
        {loadingRecent ? (
          <div className="space-y-2">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : recentlyUpdated.length > 0 ? (
          <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
            <CardContent className="p-0 divide-y divide-border">
              {recentlyUpdated.map((target) => (
                <Link key={target.id} href={`/targets/${target.id}`}>
                  <div className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors group">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{target.projectName}</div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-2 mt-0.5">
                        <span>{target.targetCode}</span>
                        {target.sector && <><span className="w-1 h-1 bg-border rounded-full" /><span>{target.sector}</span></>}
                        {target.currentStage && <><span className="w-1 h-1 bg-border rounded-full" /><span>{target.currentStage}</span></>}
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
          <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
            <CardContent className="p-6 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
              No active targets
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
