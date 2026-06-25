import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  Lightbulb, RefreshCw, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────

interface SectorAccuracy {
  sector: string;
  correct: number;
  partiallyCorrect: number;
  wrong: number;
  total: number;
}

interface MissTheme {
  theme: string;
  count: number;
}

interface ClosureSummary {
  id: number;
  targetCode: string;
  projectName: string;
  sector: string | null;
  currentStage: string;
  closeReasonCode: string | null;
  phase1VerdictAccuracy: string | null;
  phase1VerdictNote: string | null;
  closeMissTheme: string | null;
  updatedAt: string | null;
}

interface WinLossSector {
  sector: string;
  wins: number;
  losses: number;
  total: number;
}

interface DoctrineSummary {
  accuracyBySector: SectorAccuracy[];
  missThemes: MissTheme[];
  winLossBySector: WinLossSector[];
  recentClosures: ClosureSummary[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function accuracyColor(accuracy: string | null) {
  if (accuracy === "Correct") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/25";
  if (accuracy === "Partially-correct") return "bg-amber-500/10 text-amber-600 border-amber-500/25";
  if (accuracy === "Wrong") return "bg-destructive/10 text-destructive border-destructive/25";
  return "bg-muted text-muted-foreground border-border/50";
}

function stageColor(stage: string) {
  if (stage === "Closed") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/25";
  if (stage === "Dropped" || stage === "Rejected") return "bg-destructive/10 text-destructive border-destructive/25";
  return "bg-muted text-muted-foreground border-border/50";
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Doctrine() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  const { data, isLoading } = useQuery({
    queryKey: ["doctrine-summary", refreshKey],
    queryFn: () => customFetch<DoctrineSummary>("/api/doctrine/summary"),
  });

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    setRefreshedAt(new Date());
  };

  const chartData = (data?.accuracyBySector ?? []).map((s) => ({
    sector: s.sector.length > 14 ? s.sector.slice(0, 12) + "…" : s.sector,
    fullSector: s.sector,
    Correct: s.correct,
    "Partially-correct": s.partiallyCorrect,
    Wrong: s.wrong,
  }));

  const hasVerdictData = (data?.recentClosures ?? []).some((c) => c.phase1VerdictAccuracy);

  return (
    <div className="flex flex-col h-full">
      <div className="page-hero px-4 md:px-6 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Lightbulb size={16} className="text-primary shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold font-mono tracking-tight">Doctrine</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 hidden md:block">
                Learning loop — Phase 1 accuracy patterns and deal closure analysis.
              </p>
            </div>
            <span className="metadata-label text-muted-foreground/40 hidden sm:inline mt-1">
              refreshed {format(refreshedAt, "h:mm a")}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg font-mono text-[10px] uppercase shrink-0 border-border/60 h-7 px-2.5 gap-1.5"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw size={11} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        {/* Empty state — no verdict data yet */}
        {!isLoading && !hasVerdictData && (
          <Card className="border-border/60 bg-card rounded-xl">
            <CardContent className="p-6 text-center space-y-2">
              <Lightbulb size={32} className="text-muted-foreground/30 mx-auto" />
              <p className="text-sm font-mono text-muted-foreground">No verdict data yet.</p>
              <p className="text-[11px] text-muted-foreground/60 max-w-sm mx-auto">
                When deals are closed or dropped, the stage-change dialog will ask for a Phase 1 accuracy verdict.
                Those verdicts will appear here.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Panel 1 — Verdict Accuracy by Sector */}
        <Card className="border-border/60 bg-card rounded-xl">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="font-mono uppercase tracking-tight text-sm">
              Phase 1 Accuracy by Sector
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : chartData.length === 0 ? (
              <p className="text-[11px] text-muted-foreground font-mono py-6 text-center">
                No sector accuracy data — close or drop deals with Phase 1 verdicts to populate this chart.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fontFamily: "monospace" }} />
                  <YAxis
                    dataKey="sector"
                    type="category"
                    width={90}
                    tick={{ fontSize: 10, fontFamily: "monospace" }}
                  />
                  <RechartsTooltip
                    contentStyle={{ fontSize: 11, fontFamily: "monospace", borderRadius: 4 }}
                    formatter={(value, name) => [value, name]}
                    labelFormatter={(label, payload) => {
                      const full = payload?.[0]?.payload?.fullSector ?? label;
                      return full;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }} />
                  <Bar dataKey="Correct" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Partially-correct" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="Wrong" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Panel 2 — Win / Loss by Sector */}
        <Card className="border-border/60 bg-card rounded-xl">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono uppercase tracking-tight text-sm">
                Win / Loss by Sector
              </CardTitle>
              <Link href="/analytics">
                <span className="text-[10px] font-mono text-primary/70 hover:text-primary flex items-center gap-1 cursor-pointer transition-colors">
                  Analytics <ArrowRight size={10} />
                </span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : (data?.winLossBySector ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground font-mono py-4 text-center">
                No closed deals yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {(data?.winLossBySector ?? []).map((s) => {
                  const winPct = s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0;
                  const analyticsHref = `/analytics?sector=${encodeURIComponent(s.sector)}`;
                  return (
                    <div key={s.sector} className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <Link href={analyticsHref}>
                          <span className="text-[11px] font-mono text-muted-foreground hover:text-primary cursor-pointer transition-colors truncate max-w-[160px]">
                            {s.sector}
                          </span>
                        </Link>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-emerald-600">{s.wins}W</span>
                          <span className="text-[10px] font-mono text-destructive/70">{s.losses}L</span>
                          <Link href={analyticsHref}>
                            <Badge variant="secondary" className="text-[10px] font-mono cursor-pointer hover:bg-primary/10 transition-colors">{winPct}%</Badge>
                          </Link>
                        </div>
                      </div>
                      <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-destructive/20">
                        <div
                          className="h-full bg-emerald-500/70 transition-all"
                          style={{ width: `${winPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel 3 — Most Common Miss Categories */}
        <Card className="border-border/60 bg-card rounded-xl">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="font-mono uppercase tracking-tight text-sm">
              Most Common Miss Themes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <Skeleton className="h-32 w-full rounded-lg" />
            ) : (data?.missThemes ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground font-mono py-4 text-center">
                No miss themes tagged yet.
              </p>
            ) : (
              <div className="space-y-2">
                {(data?.missThemes ?? []).map((t) => {
                  const max = Math.max(...(data?.missThemes ?? []).map((x) => x.count), 1);
                  const pct = Math.round((t.count / max) * 100);
                  return (
                    <div key={t.theme} className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-muted-foreground w-36 shrink-0 truncate">{t.theme}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/60 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-mono shrink-0">{t.count}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel 3 — Recent Closures */}
        <Card className="border-border/60 bg-card rounded-xl">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono uppercase tracking-tight text-sm">
                Recent Closures
              </CardTitle>
              <Link href="/analytics">
                <span className="text-[10px] font-mono text-primary/70 hover:text-primary flex items-center gap-1 cursor-pointer transition-colors">
                  Pipeline analytics <ArrowRight size={10} />
                </span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : (data?.recentClosures ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground font-mono py-4 text-center">
                No closed or dropped deals yet.
              </p>
            ) : (
              <div className="space-y-2">
                {(data?.recentClosures ?? []).map((c) => (
                  <Link key={c.id} href={`/targets/${c.id}`}>
                    <Card className="bg-card border-border/60 rounded-xl hover:shadow-sm transition-all duration-150 cursor-pointer group">
                      <CardContent className="p-3.5 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{c.projectName}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                            <span className="metadata-label">{c.targetCode}</span>
                            {c.sector && <span className="metadata-label">{c.sector}</span>}
                            <span className={`status-chip ${stageColor(c.currentStage)}`}>{c.currentStage}</span>
                            {c.closeReasonCode && (
                              <span className="metadata-label text-muted-foreground/70">{c.closeReasonCode}</span>
                            )}
                          </div>
                          {c.phase1VerdictAccuracy && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">Phase 1:</span>
                              <span className={`status-chip ${accuracyColor(c.phase1VerdictAccuracy)}`}>
                                {c.phase1VerdictAccuracy}
                              </span>
                              {c.closeMissTheme && (
                                <span className="metadata-label text-muted-foreground/60">{c.closeMissTheme}</span>
                              )}
                            </div>
                          )}
                          {c.phase1VerdictNote && (
                            <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono line-clamp-2">{c.phase1VerdictNote}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {c.updatedAt && (
                            <span className="text-[10px] font-mono text-muted-foreground/40">
                              {format(parseISO(c.updatedAt), "MMM d, yyyy")}
                            </span>
                          )}
                          <ArrowRight size={13} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
