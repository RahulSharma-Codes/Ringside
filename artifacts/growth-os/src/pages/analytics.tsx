import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  useGetAnalyticsFunnel, getGetAnalyticsFunnelQueryKey,
  useGetAnalyticsTimeInStage, getGetAnalyticsTimeInStageQueryKey,
  useGetAnalyticsWinLoss, getGetAnalyticsWinLossQueryKey,
  useGetAnalyticsOrigination, getGetAnalyticsOriginationQueryKey,
  useGetTargetFilterOptions, getGetTargetFilterOptionsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, TrendingUp, Clock, Trophy, Compass, AlertTriangle, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const CHART_COLORS = {
  primary:     "hsl(var(--primary))",
  amber:       "#f59e0b",
  emerald:     "#10b981",
  destructive: "hsl(var(--destructive))",
  blue:        "#3b82f6",
  violet:      "#8b5cf6",
  orange:      "#f97316",
};

const PIE_WON  = CHART_COLORS.emerald;
const PIE_DROP = CHART_COLORS.destructive;

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionCard({
  icon, title, subtitle, loading, children,
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
        {loading ? <Skeleton className="h-52 w-full rounded-lg" /> : children}
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-[11px] font-mono text-muted-foreground/50 uppercase tracking-widest">
      {message}
    </div>
  );
}

const ChartTooltip = ({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) => {
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

function shortStage(s: string): string {
  const MAP: Record<string, string> = {
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
  return MAP[s] ?? s;
}

// ── Filter bar ────────────────────────────────────────────────────────────────

type Filters = { dealType: string; sector: string };

function FilterBar({
  filters, onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const { data: opts } = useGetTargetFilterOptions({
    query: { queryKey: getGetTargetFilterOptionsQueryKey() },
  });

  const sectors   = opts?.sectors   ?? [];
  const dealTypes = opts?.dealTypes ?? [];
  const hasFilters = filters.dealType !== "all" || filters.sector !== "all";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {dealTypes.length > 0 && (
        <Select value={filters.dealType} onValueChange={(v) => onChange({ ...filters, dealType: v })}>
          <SelectTrigger className="w-[140px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-7">
            <SelectValue placeholder="Deal Type" />
          </SelectTrigger>
          <SelectContent className="font-mono text-[11px]">
            <SelectItem value="all">All Types</SelectItem>
            {dealTypes.map((dt) => <SelectItem key={dt} value={dt}>{dt}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {sectors.length > 0 && (
        <Select value={filters.sector} onValueChange={(v) => onChange({ ...filters, sector: v })}>
          <SelectTrigger className="w-[130px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-7">
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent className="font-mono text-[11px]">
            <SelectItem value="all">All Sectors</SelectItem>
            {sectors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {hasFilters && (
        <button
          onClick={() => onChange({ dealType: "all", sector: "all" })}
          className="h-7 px-2.5 rounded-lg text-[11px] font-mono text-muted-foreground/60 hover:text-muted-foreground border border-dashed border-border/40 transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}

// ── Funnel panel ──────────────────────────────────────────────────────────────

function FunnelPanel({ filters }: { filters: Filters }) {
  const params = {
    dealType: filters.dealType !== "all" ? filters.dealType : undefined,
    sector:   filters.sector   !== "all" ? filters.sector   : undefined,
  };
  const { data, isLoading } = useGetAnalyticsFunnel(params, {
    query: { queryKey: getGetAnalyticsFunnelQueryKey(params) },
  });

  if (isLoading) return <SectionCard icon={<TrendingUp size={15} />} title="Pipeline Funnel" loading><></></SectionCard>;

  const entries = data ?? [];
  if (!entries.length) {
    return (
      <SectionCard icon={<TrendingUp size={15} />} title="Pipeline Funnel" subtitle="Stage-to-stage conversion">
        <EmptyState message="No stage data available" />
      </SectionCard>
    );
  }

  const chartData = entries.map((e) => ({
    stage: shortStage(e.stage),
    fullStage: e.stage,
    Entered: e.entered,
    Active: e.current,
    conversionRate: e.conversionRate,
  }));

  return (
    <SectionCard
      icon={<TrendingUp size={15} />}
      title="Pipeline Funnel"
      subtitle="Deals entered at each stage and stage-to-stage conversion rate"
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -12, bottom: 44 }}>
            <XAxis
              dataKey="stage"
              tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", paddingTop: 4 }} />
            <Bar dataKey="Entered" fill={CHART_COLORS.primary} opacity={0.35} radius={[3, 3, 0, 0]} />
            <Bar dataKey="Active" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Conversion rate row */}
      <div className="mt-3 flex flex-wrap items-center gap-0.5 overflow-x-auto">
        {entries.map((e, idx) => (
          <React.Fragment key={e.stage}>
            <div className="flex flex-col items-center min-w-[44px]">
              <span className="text-[8px] font-mono text-muted-foreground/60 truncate max-w-[44px] text-center">{shortStage(e.stage)}</span>
              <span className="text-[9px] font-mono text-foreground/80 font-semibold">{e.entered}</span>
            </div>
            {idx < entries.length - 1 && e.conversionRate !== null && e.conversionRate !== undefined && (
              <div className="flex flex-col items-center px-0.5">
                <ArrowRight size={9} className="text-muted-foreground/30" />
                <span className={`text-[8px] font-mono ${e.conversionRate >= 50 ? "text-emerald-500" : e.conversionRate >= 25 ? "text-amber-500" : "text-destructive/70"}`}>
                  {e.conversionRate}%
                </span>
              </div>
            )}
            {idx < entries.length - 1 && (e.conversionRate === null || e.conversionRate === undefined) && (
              <ArrowRight size={9} className="text-muted-foreground/20 mx-0.5" />
            )}
          </React.Fragment>
        ))}
      </div>
    </SectionCard>
  );
}

// ── Time-in-Stage panel ───────────────────────────────────────────────────────

function TimeInStagePanel({ filters }: { filters: Filters }) {
  const params = {
    dealType: filters.dealType !== "all" ? filters.dealType : undefined,
    sector:   filters.sector   !== "all" ? filters.sector   : undefined,
  };
  const { data, isLoading } = useGetAnalyticsTimeInStage(params, {
    query: { queryKey: getGetAnalyticsTimeInStageQueryKey(params) },
  });

  if (isLoading) return <SectionCard icon={<Clock size={15} />} title="Time in Stage" loading><></></SectionCard>;

  const historical = data?.historical ?? [];
  const currentDeals = data?.currentDeals ?? [];
  const staleDeals = currentDeals.filter((d) => d.isStale);

  if (!historical.length && !currentDeals.length) {
    return (
      <SectionCard icon={<Clock size={15} />} title="Time in Stage" subtitle="Stage dwell times and current deal aging">
        <EmptyState message="No stage transition data yet" />
      </SectionCard>
    );
  }

  const chartData = historical.map((e) => ({
    stage: shortStage(e.stage),
    "Avg Days": e.avgDays,
    "Median Days": e.medianDays,
  }));

  return (
    <SectionCard
      icon={<Clock size={15} />}
      title="Time in Stage"
      subtitle="Historical avg/median dwell plus current deal aging"
    >
      {chartData.length > 0 && (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 50, left: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} unit=" d" />
              <YAxis dataKey="stage" type="category" width={68} tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)" }} />
              <Bar dataKey="Avg Days" fill={CHART_COLORS.amber} radius={[0, 3, 3, 0]} />
              <Bar dataKey="Median Days" fill={CHART_COLORS.orange} opacity={0.55} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stale deal list */}
      {currentDeals.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              Current Deal Aging — sorted longest-in-stage
            </p>
            {staleDeals.length > 0 && (
              <Badge className="font-mono text-[8px] bg-amber-500/15 text-amber-500 border border-amber-500/30 rounded-md px-1.5">
                <AlertTriangle size={8} className="mr-1" /> {staleDeals.length} stale
              </Badge>
            )}
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {currentDeals.slice(0, 15).map((deal) => (
              <Link key={deal.targetId} href={`/targets/${deal.targetId}`}>
                <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono cursor-pointer transition-colors hover:bg-muted/40 ${deal.isStale ? "border-amber-500/30 bg-amber-500/5" : "border-border/50 bg-background/40"}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {deal.isStale && <AlertTriangle size={9} className="text-amber-500 shrink-0" />}
                    <span className="text-muted-foreground/60 shrink-0">{deal.targetCode}</span>
                    <span className="truncate text-foreground/80">{deal.projectName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground/50 hidden sm:block">{shortStage(deal.stage)}</span>
                    <span className={`font-semibold ${deal.isStale ? "text-amber-500" : "text-muted-foreground"}`}>
                      {Math.round(deal.daysInStage)}d
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Win/Loss panel ────────────────────────────────────────────────────────────

function WinLossPanel({ filters }: { filters: Filters }) {
  const params = {
    dealType: filters.dealType !== "all" ? filters.dealType : undefined,
    sector:   filters.sector   !== "all" ? filters.sector   : undefined,
  };
  const { data, isLoading } = useGetAnalyticsWinLoss(params, {
    query: { queryKey: getGetAnalyticsWinLossQueryKey(params) },
  });

  if (isLoading) return <SectionCard icon={<Trophy size={15} />} title="Win / Loss Analysis" loading><></></SectionCard>;

  if (!data) {
    return (
      <SectionCard icon={<Trophy size={15} />} title="Win / Loss Analysis">
        <EmptyState message="No data available" />
      </SectionCard>
    );
  }

  const outcomeData = [
    { name: "Won", value: data.won },
    { name: "Dropped", value: data.dropped },
  ].filter((d) => d.value > 0);

  const pieColors = [PIE_WON, PIE_DROP];

  return (
    <SectionCard
      icon={<Trophy size={15} />}
      title="Win / Loss Analysis"
      subtitle={`${data.periodLabel} · ${data.totalConcluded} concluded deals`}
    >
      <div className="grid grid-cols-2 gap-4">
        {/* Outcome ratio */}
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Concluded Outcomes</p>
          {outcomeData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-[10px] font-mono text-muted-foreground/50">
              No concluded deals
            </div>
          ) : (
            <>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={outcomeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={4}>
                      {outcomeData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)" }} />
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {data.winRate !== null && data.winRate !== undefined && (
                <div className="text-center mt-1">
                  <span className="text-[11px] font-mono font-semibold text-emerald-500">{data.winRate}% win rate</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Drop reasons */}
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Drop Reasons</p>
          {(data.byDropReason ?? []).length === 0 ? (
            <div className="flex items-center justify-center h-36 text-[10px] font-mono text-muted-foreground/50">
              No dropped deals
            </div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {(data.byDropReason ?? []).slice(0, 8).map((r) => (
                <div key={r.category} className="flex items-start gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground flex-1 leading-snug">{r.category}</span>
                  <Badge variant="outline" className="font-mono text-[9px] shrink-0">{r.count}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sector breakdown */}
      {(data.bySector ?? []).length > 0 && (
        <div className="mt-4">
          <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">By Sector</p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(data.bySector ?? []).slice(0, 8).map((s) => ({
                  sector: s.sector.length > 14 ? s.sector.slice(0, 12) + "…" : s.sector,
                  Won: s.won,
                  Dropped: s.dropped,
                }))}
                margin={{ top: 4, right: 4, left: -20, bottom: 32 }}
              >
                <XAxis dataKey="sector" tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)" }} />
                <Bar dataKey="Won" stackId="a" fill={CHART_COLORS.emerald} />
                <Bar dataKey="Dropped" stackId="a" fill={CHART_COLORS.destructive} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Origination panel ─────────────────────────────────────────────────────────

function OriginationPanel({ filters }: { filters: Filters }) {
  const params = {
    dealType: filters.dealType !== "all" ? filters.dealType : undefined,
    sector:   filters.sector   !== "all" ? filters.sector   : undefined,
  };
  const { data, isLoading } = useGetAnalyticsOrigination(params, {
    query: { queryKey: getGetAnalyticsOriginationQueryKey(params) },
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
    Won: e.won,
    Dropped: e.dropped,
    "In Progress": e.inProgress,
  }));

  return (
    <SectionCard
      icon={<Compass size={15} />}
      title="Origination Channel"
      subtitle="Deal volume and win rate by sourcing channel"
    >
      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1">
        {entries.slice(0, 6).map((e) => (
          <div key={e.channel} className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-[10px] font-mono text-muted-foreground truncate">{e.channel}</span>
            <span className="text-[10px] font-mono font-medium shrink-0">
              {e.total} deal{e.total !== 1 ? "s" : ""}
              {e.winRate !== null && e.winRate !== undefined && (
                <span className="text-emerald-500 ml-1">· {e.winRate}%</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 44 }}>
            <XAxis
              dataKey="channel"
              tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis tick={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 9, fontFamily: "var(--font-mono, monospace)", paddingTop: 4 }} />
            <Bar dataKey="Won" stackId="a" fill={CHART_COLORS.emerald} />
            <Bar dataKey="Dropped" stackId="a" fill={CHART_COLORS.destructive} />
            <Bar dataKey="In Progress" stackId="a" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

// ── Main analytics page ───────────────────────────────────────────────────────

export default function Analytics() {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Filters>(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      dealType: p.get("dealType") ?? "all",
      sector:   p.get("sector")   ?? "all",
    };
  });

  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.dealType !== "all") params.set("dealType", filters.dealType);
    if (filters.sector   !== "all") params.set("sector",   filters.sector);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/analytics?${qs}` : "/analytics");
  }, [filters]);

  function handleRefresh() {
    const p = {
      dealType: filters.dealType !== "all" ? filters.dealType : undefined,
      sector:   filters.sector   !== "all" ? filters.sector   : undefined,
    };
    queryClient.invalidateQueries({ queryKey: getGetAnalyticsFunnelQueryKey(p) });
    queryClient.invalidateQueries({ queryKey: getGetAnalyticsTimeInStageQueryKey(p) });
    queryClient.invalidateQueries({ queryKey: getGetAnalyticsWinLossQueryKey(p) });
    queryClient.invalidateQueries({ queryKey: getGetAnalyticsOriginationQueryKey(p) });
    setRefreshedAt(new Date());
  }

  return (
    <div className="animate-in fade-in duration-500 pb-20 md:pb-8">
      {/* Header */}
      <div className="page-hero-sticky px-4 md:px-6 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight">Pipeline Analytics</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden md:block">
              Funnel conversion, time-in-stage, win/loss analysis, and origination channel performance.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono text-muted-foreground/50 hidden md:block">
              {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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

        <FilterBar filters={filters} onChange={setFilters} />
      </div>

      {/* 2-col grid */}
      <div className="p-4 md:p-6 grid grid-cols-1 xl:grid-cols-2 gap-5">
        <FunnelPanel    filters={filters} />
        <TimeInStagePanel filters={filters} />
        <WinLossPanel   filters={filters} />
        <OriginationPanel filters={filters} />
      </div>
    </div>
  );
}
