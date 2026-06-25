import React, { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from "recharts";
import {
  useGetAnalyticsFunnel, getGetAnalyticsFunnelQueryKey,
  useGetAnalyticsTimeInStage, getGetAnalyticsTimeInStageQueryKey,
  useGetAnalyticsWinLoss, getGetAnalyticsWinLossQueryKey,
  useGetAnalyticsOrigination, getGetAnalyticsOriginationQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, TrendingUp, Clock, Trophy, Compass } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const COLORS = {
  primary:    "hsl(var(--primary))",
  amber:      "#f59e0b",
  emerald:    "#10b981",
  destructive:"hsl(var(--destructive))",
  muted:      "hsl(var(--muted-foreground))",
  blue:       "#3b82f6",
  violet:     "#8b5cf6",
  orange:     "#f97316",
};

const PIE_PALETTE = [COLORS.emerald, COLORS.destructive, COLORS.primary, COLORS.amber, COLORS.violet, COLORS.orange, COLORS.blue];

function SectionCard({
  icon,
  title,
  subtitle,
  loading,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-card border-border/70 rounded-xl overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center gap-2.5">
          <span className="text-primary/70">{icon}</span>
          <div>
            <CardTitle className="text-sm font-mono font-semibold uppercase tracking-wider">{title}</CardTitle>
            {subtitle && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-48 text-[11px] font-mono text-muted-foreground/50 uppercase tracking-widest">
      {message}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border/60 rounded-lg px-3 py-2 shadow-md text-[11px] font-mono">
      {label && <div className="font-semibold text-foreground mb-1">{label}</div>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span style={{ color: entry.color }}>■</span>
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Funnel Panel ─────────────────────────────────────────────────────────────

function FunnelPanel() {
  const { data, isLoading } = useGetAnalyticsFunnel({
    query: { queryKey: getGetAnalyticsFunnelQueryKey() },
  });

  if (isLoading) return <SectionCard icon={<TrendingUp size={15} />} title="Pipeline Funnel" loading><></></SectionCard>;

  const entries = data ?? [];
  if (!entries.length) {
    return (
      <SectionCard icon={<TrendingUp size={15} />} title="Pipeline Funnel" subtitle="Deals entered vs currently active at each stage">
        <EmptyState message="No stage data available" />
      </SectionCard>
    );
  }

  const SHORT: Record<string, string> = {
    "Sourcing": "Sourcing",
    "Outreach": "Outreach",
    "Introductory Discussion": "Intro",
    "NDA / CIM": "NDA",
    "Preliminary Due Diligence": "Pre-DD",
    "Management Meeting": "Mgmt Mtg",
    "Non-Binding Offer": "NBO",
    "Confirmatory Due Diligence": "Conf DD",
    "Binding Offer": "BO",
    "SPA Negotiation": "SPA",
    "Integration Planning": "Integration",
  };

  const chartData = entries.map((e) => ({
    stage: SHORT[e.stage] ?? e.stage,
    fullStage: e.stage,
    Entered: e.entered,
    Active: e.current,
  }));

  return (
    <SectionCard
      icon={<TrendingUp size={15} />}
      title="Pipeline Funnel"
      subtitle="Distinct deals that ever reached each stage vs currently active"
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -12, bottom: 40 }}>
            <XAxis
              dataKey="stage"
              tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", paddingTop: 4 }} />
            <Bar dataKey="Entered" fill={COLORS.primary} opacity={0.4} radius={[3, 3, 0, 0]} />
            <Bar dataKey="Active" fill={COLORS.primary} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

// ── Time-in-Stage Panel ───────────────────────────────────────────────────────

function TimeInStagePanel() {
  const { data, isLoading } = useGetAnalyticsTimeInStage({
    query: { queryKey: getGetAnalyticsTimeInStageQueryKey() },
  });

  if (isLoading) return <SectionCard icon={<Clock size={15} />} title="Time in Stage" loading><></></SectionCard>;

  const entries = data ?? [];
  if (!entries.length) {
    return (
      <SectionCard icon={<Clock size={15} />} title="Time in Stage" subtitle="Average days spent at each pipeline stage">
        <EmptyState message="No stage transition data yet" />
      </SectionCard>
    );
  }

  const SHORT: Record<string, string> = {
    "Introductory Discussion": "Intro",
    "NDA / CIM": "NDA",
    "Preliminary Due Diligence": "Pre-DD",
    "Management Meeting": "Mgmt Mtg",
    "Non-Binding Offer": "NBO",
    "Confirmatory Due Diligence": "Conf DD",
    "Binding Offer": "BO",
    "SPA Negotiation": "SPA",
    "Integration Planning": "Integration",
  };

  const chartData = entries.map((e) => ({
    stage: SHORT[e.stage] ?? e.stage,
    "Avg Days": e.avgDays,
    "Median Days": e.medianDays,
    n: e.count,
  }));

  return (
    <SectionCard
      icon={<Clock size={15} />}
      title="Time in Stage"
      subtitle="Average and median days before progressing from each stage"
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
            <XAxis type="number" tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} unit=" d" />
            <YAxis dataKey="stage" type="category" width={70} tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)" }} />
            <Bar dataKey="Avg Days" fill={COLORS.amber} radius={[0, 3, 3, 0]}>
              <LabelList dataKey="Avg Days" position="right" style={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} formatter={(v: number) => `${v}d`} />
            </Bar>
            <Bar dataKey="Median Days" fill={COLORS.orange} opacity={0.6} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

// ── Win/Loss Panel ────────────────────────────────────────────────────────────

function WinLossPanel() {
  const { data, isLoading } = useGetAnalyticsWinLoss({
    query: { queryKey: getGetAnalyticsWinLossQueryKey() },
  });

  if (isLoading) return <SectionCard icon={<Trophy size={15} />} title="Win / Loss Analysis" loading><></></SectionCard>;

  if (!data) {
    return (
      <SectionCard icon={<Trophy size={15} />} title="Win / Loss Analysis" subtitle="Outcomes and drop reason breakdown">
        <EmptyState message="No data available" />
      </SectionCard>
    );
  }

  const outcomeData = [
    { name: "Won", value: data.won },
    { name: "Dropped", value: data.dropped },
    { name: "In Progress", value: data.inProgress },
  ].filter((d) => d.value > 0);

  const pieColors = [COLORS.emerald, COLORS.destructive, COLORS.primary];

  const dropReasonData = (data.byDropReason ?? []).slice(0, 6);

  return (
    <SectionCard
      icon={<Trophy size={15} />}
      title="Win / Loss Analysis"
      subtitle={`${data.totalEvaluated} total deals evaluated`}
    >
      <div className="grid grid-cols-2 gap-4">
        {/* Outcome Pie */}
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Outcome Split</p>
          {outcomeData.length === 0 ? (
            <EmptyState message="No concluded deals" />
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={outcomeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {outcomeData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)" }} />
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Drop Reasons */}
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Drop Reasons</p>
          {dropReasonData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-[10px] font-mono text-muted-foreground/50">
              No dropped deals recorded
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              {dropReasonData.map((r) => (
                <div key={r.category} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">{r.category}</span>
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">{r.count}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* By Deal Type bar */}
      {(data.byDealType ?? []).length > 0 && (
        <div className="mt-4">
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">By Deal Type</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(data.byDealType ?? []).slice(0, 8)} margin={{ top: 4, right: 4, left: -20, bottom: 30 }}>
                <XAxis dataKey="type" tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)" }} />
                <Bar dataKey="won" name="Won" stackId="a" fill={COLORS.emerald} radius={[0, 0, 0, 0]} />
                <Bar dataKey="dropped" name="Dropped" stackId="a" fill={COLORS.destructive} />
                <Bar dataKey="inProgress" name="In Progress" stackId="a" fill={COLORS.primary} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Origination Panel ─────────────────────────────────────────────────────────

function OriginationPanel() {
  const { data, isLoading } = useGetAnalyticsOrigination({
    query: { queryKey: getGetAnalyticsOriginationQueryKey() },
  });

  if (isLoading) return <SectionCard icon={<Compass size={15} />} title="Origination Channel" loading><></></SectionCard>;

  const entries = (data ?? []).filter((e) => e.total > 0);
  if (!entries.length) {
    return (
      <SectionCard icon={<Compass size={15} />} title="Origination Channel" subtitle="Deal volume and win rate by sourcing channel">
        <EmptyState message="No sourcing channel data" />
      </SectionCard>
    );
  }

  const chartData = entries.slice(0, 10).map((e) => ({
    channel: e.channel.length > 16 ? e.channel.slice(0, 14) + "…" : e.channel,
    fullChannel: e.channel,
    Won: e.won,
    Dropped: e.dropped,
    "In Progress": e.inProgress,
    winRate: e.winRate,
  }));

  return (
    <SectionCard
      icon={<Compass size={15} />}
      title="Origination Channel"
      subtitle="Deal volume by sourcing channel with stacked outcome split"
    >
      {/* Win rate table */}
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1">
        {entries.slice(0, 6).map((e) => (
          <div key={e.channel} className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-[10px] font-mono text-muted-foreground truncate">{e.channel}</span>
            <span className="text-[10px] font-mono font-medium shrink-0">
              {e.total} deal{e.total !== 1 ? "s" : ""}
              {e.winRate !== null && e.winRate !== undefined && (
                <span className="text-emerald-500 ml-1">· {e.winRate}% win</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 40 }}>
            <XAxis
              dataKey="channel"
              tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", paddingTop: 4 }} />
            <Bar dataKey="Won" stackId="a" fill={COLORS.emerald} />
            <Bar dataKey="Dropped" stackId="a" fill={COLORS.destructive} />
            <Bar dataKey="In Progress" stackId="a" fill={COLORS.primary} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

// ── Main Analytics Page ───────────────────────────────────────────────────────

export default function Analytics() {
  const queryClient = useQueryClient();
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: getGetAnalyticsFunnelQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAnalyticsTimeInStageQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAnalyticsWinLossQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAnalyticsOriginationQueryKey() });
    setRefreshedAt(new Date());
  }

  return (
    <div className="animate-in fade-in duration-500 pb-20 md:pb-8">
      {/* Header */}
      <div className="page-hero-sticky px-4 md:px-6 pt-4 pb-3 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight">Pipeline Analytics</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden md:block">
              Funnel conversion, time-in-stage, win/loss analysis, and origination channel performance.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono text-muted-foreground/50 hidden md:block">
              As of {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg font-mono uppercase tracking-wider text-[10px] gap-1.5 border-border/60 h-7 px-2.5"
              onClick={handleRefresh}
            >
              <RefreshCw size={11} /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* 2-column grid */}
      <div className="p-4 md:p-6 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <FunnelPanel />
        <TimeInStagePanel />
        <WinLossPanel />
        <OriginationPanel />
      </div>
    </div>
  );
}
