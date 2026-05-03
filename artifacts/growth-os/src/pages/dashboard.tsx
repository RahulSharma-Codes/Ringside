import React from "react";
import { Link } from "wouter";
import { 
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetTargetsByStage, getGetTargetsByStageQueryKey,
  useGetTopPriorityTargets, getGetTopPriorityTargetsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Target, TrendingUp, AlertOctagon, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  const { data: stageData, isLoading: loadingStages } = useGetTargetsByStage({
    query: { queryKey: getGetTargetsByStageQueryKey() }
  });

  const { data: topTargets, isLoading: loadingTop } = useGetTopPriorityTargets({ limit: 5 }, {
    query: { queryKey: getGetTopPriorityTargetsQueryKey({ limit: 5 }) }
  });

  if (loadingSummary) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Executive Summary</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Executive Summary</h1>
          <p className="text-sm text-muted-foreground">High-level view of the M&A pipeline</p>
        </div>
        <div className="text-xs font-mono text-muted-foreground bg-muted/50 px-3 py-1 rounded-sm border border-border">
          SYSTEM STATUS: OPTIMAL
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Active Targets</CardTitle>
            <Target size={14} className="text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">{summary?.activeTargets || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Must Win</CardTitle>
            <AlertOctagon size={14} className="text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono text-destructive">{summary?.mustWinCount || 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-mono">+ {summary?.priority1Count || 0} PRIORITY 1</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Avg Score</CardTitle>
            <TrendingUp size={14} className="text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">{Math.round(summary?.avgPriorityScore || 0)}</div>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-mono">OUT OF 100</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm border-l-2 border-l-amber-500">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Open Actions</CardTitle>
            <AlertCircle size={14} className="text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono text-amber-500">{summary?.openActionsCount || 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-mono">{summary?.overdueActionsCount || 0} OVERDUE</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase font-mono tracking-wider flex items-center gap-2">
              <BarChart3 size={14} />
              Pipeline Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loadingStages ? (
              <Skeleton className="w-full h-full" />
            ) : stageData && stageData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="stage" 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "var(--app-font-mono)" }}
                    tickLine={false}
                    axisLine={false}
                    angle={-45}
                    textAnchor="end"
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
                      color: "hsl(var(--popover-foreground))"
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
          <CardHeader>
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase font-mono tracking-wider flex items-center justify-between">
              <span>Top Opportunities</span>
              <Badge variant="outline" className="font-mono text-[10px] rounded-sm">Score</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            {loadingTop ? (
              Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : topTargets && topTargets.length > 0 ? (
              topTargets.map((target) => (
                <div key={target.id} className="flex items-center justify-between group">
                  <div className="overflow-hidden">
                    <Link href={`/targets/${target.id}`} className="hover:underline underline-offset-4 text-sm font-medium truncate block">
                      {target.projectName}
                    </Link>
                    <div className="text-[10px] text-muted-foreground font-mono truncate uppercase flex items-center gap-2">
                      <span className={target.priorityTier === 'Must-Win' ? 'text-destructive font-bold' : ''}>
                        {target.priorityTier}
                      </span>
                      <span className="w-1 h-1 bg-border rounded-full" />
                      <span>{target.sector}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <div className="text-right">
                      <div className="text-sm font-mono font-bold text-primary">{Math.round(target.priorityScore)}</div>
                    </div>
                    <Link href={`/targets/${target.id}`}>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight size={14} />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Closed Deals</CardTitle>
            <CheckCircle2 size={14} className="text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono">{summary?.closedDealsCount || 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider">Dropped Deals</CardTitle>
            <XCircle size={14} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-mono text-muted-foreground">{summary?.droppedDealsCount || 0}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BarChart3(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}
