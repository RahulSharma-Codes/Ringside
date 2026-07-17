import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
  LineChart, Line, ReferenceLine,
  CartesianGrid,
} from "recharts";
import {
  Lightbulb, RefreshCw, ArrowRight, FileDown, Loader2, TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import jsPDF from "jspdf";

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

interface AccuracyByPeriod {
  period: string;
  periodStart: string;
  total: number;
  correct: number;
  partiallyCorrect: number;
  wrong: number;
  accuracyPct: number;
}

interface DoctrineSummary {
  accuracyBySector: SectorAccuracy[];
  missThemes: MissTheme[];
  winLossBySector: WinLossSector[];
  recentClosures: ClosureSummary[];
  accuracyByQuarter: AccuracyByPeriod[];
  accuracyByMonth: AccuracyByPeriod[];
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

// ── PDF export ─────────────────────────────────────────────────────────────

function buildDoctrinePdf(data: DoctrineSummary): jsPDF {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PAGE_W = 210;
  const MARGIN = 16;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const generatedAt = format(new Date(), "d MMM yyyy, h:mm a");

  // ── Fonts & helpers ──────────────────────────────────────────────────────
  let y = MARGIN;

  const checkPageBreak = (needed: number) => {
    if (y + needed > 277) {
      pdf.addPage();
      y = MARGIN;
      drawPageFooter();
    }
  };

  const drawPageFooter = () => {
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7);
      pdf.setTextColor(160, 160, 160);
      pdf.text(
        `RINGSIDE — Doctrine Report · Generated ${generatedAt} · Page ${i} of ${totalPages}`,
        MARGIN,
        290,
      );
    }
  };

  // ── Cover header ────────────────────────────────────────────────────────
  pdf.setFillColor(15, 15, 20);
  pdf.rect(0, 0, PAGE_W, 38, "F");

  pdf.setFontSize(18);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 255, 255);
  pdf.text("RINGSIDE", MARGIN, 16);

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(200, 160, 80);
  pdf.text("DOCTRINE REPORT", MARGIN, 23);

  pdf.setFontSize(8);
  pdf.setTextColor(140, 140, 140);
  pdf.text(`Learning Loop · Phase 1 Accuracy & Deal Closure Analysis`, MARGIN, 30);
  pdf.text(`Generated ${generatedAt}`, PAGE_W - MARGIN - pdf.getTextWidth(`Generated ${generatedAt}`), 30);

  y = 50;

  // ── Section heading helper ───────────────────────────────────────────────
  const sectionHeading = (title: string) => {
    checkPageBreak(14);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30, 30, 30);
    pdf.text(title.toUpperCase(), MARGIN, y);
    pdf.setDrawColor(220, 220, 220);
    pdf.line(MARGIN, y + 2, MARGIN + CONTENT_W, y + 2);
    y += 8;
  };

  // ── Table helpers ────────────────────────────────────────────────────────
  const COL_HEAD_BG: [number, number, number] = [240, 240, 243];
  const ROW_ALT_BG: [number, number, number] = [250, 250, 252];

  const tableHeader = (cols: { label: string; w: number }[], startX: number) => {
    checkPageBreak(8);
    pdf.setFillColor(...COL_HEAD_BG);
    pdf.rect(startX, y, CONTENT_W, 7, "F");
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(80, 80, 95);
    let cx = startX + 2;
    for (const col of cols) {
      pdf.text(col.label, cx, y + 5);
      cx += col.w;
    }
    y += 7;
  };

  const tableRow = (
    values: string[],
    cols: { w: number }[],
    startX: number,
    isAlt: boolean,
    rowH = 7,
    accent?: string,
  ) => {
    checkPageBreak(rowH);
    if (isAlt) {
      pdf.setFillColor(...ROW_ALT_BG);
      pdf.rect(startX, y, CONTENT_W, rowH, "F");
    }
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(40, 40, 50);
    let cx = startX + 2;
    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      // Accent cell for accuracy (col 4 = index 3)
      if (accent && i === 3) {
        if (val === "Correct") pdf.setTextColor(5, 150, 105);
        else if (val === "Partially-correct") pdf.setTextColor(180, 100, 0);
        else if (val === "Wrong") pdf.setTextColor(220, 38, 38);
        else pdf.setTextColor(40, 40, 50);
      } else {
        pdf.setTextColor(40, 40, 50);
      }
      // Truncate long strings
      const maxW = cols[i].w - 4;
      const truncated = pdf.getTextWidth(val) > maxW
        ? val.slice(0, Math.floor(val.length * (maxW / pdf.getTextWidth(val)))) + "…"
        : val;
      pdf.text(truncated, cx, y + rowH * 0.62);
      cx += cols[i].w;
    }
    y += rowH;
  };

  // ── Mini horizontal bar ─────────────────────────────────────────────────
  const miniBar = (x: number, rowY: number, pct: number, w: number, h: number, colorR: number, colorG: number, colorB: number) => {
    pdf.setFillColor(230, 230, 235);
    pdf.roundedRect(x, rowY, w, h, 0.5, 0.5, "F");
    if (pct > 0) {
      pdf.setFillColor(colorR, colorG, colorB);
      pdf.roundedRect(x, rowY, Math.max(w * pct, 1.5), h, 0.5, 0.5, "F");
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 1 — PHASE 1 ACCURACY BY SECTOR
  // ═══════════════════════════════════════════════════════════════════════
  sectionHeading("Phase 1 Accuracy by Sector");

  if (data.accuracyBySector.length === 0) {
    pdf.setFontSize(8); pdf.setTextColor(130, 130, 140);
    pdf.text("No accuracy data recorded yet.", MARGIN, y + 4);
    y += 12;
  } else {
    const cols = [
      { label: "Sector", w: 52 },
      { label: "Correct", w: 24 },
      { label: "Partial", w: 24 },
      { label: "Wrong", w: 24 },
      { label: "Total", w: 20 },
      { label: "Accuracy Bar", w: CONTENT_W - 144 },
    ];
    tableHeader(cols, MARGIN);
    data.accuracyBySector.forEach((s, i) => {
      const pct = s.total > 0 ? s.correct / s.total : 0;
      checkPageBreak(8);
      if (i % 2 === 1) {
        pdf.setFillColor(...ROW_ALT_BG);
        pdf.rect(MARGIN, y, CONTENT_W, 7, "F");
      }
      pdf.setFontSize(7.5); pdf.setFont("helvetica", "normal"); pdf.setTextColor(40, 40, 50);
      const vals = [s.sector, String(s.correct), String(s.partiallyCorrect), String(s.wrong), String(s.total)];
      let cx = MARGIN + 2;
      vals.forEach((v, vi) => {
        const truncated = pdf.getTextWidth(v) > cols[vi].w - 4
          ? v.slice(0, Math.floor(v.length * ((cols[vi].w - 4) / pdf.getTextWidth(v)))) + "…"
          : v;
        pdf.text(truncated, cx, y + 4.8);
        cx += cols[vi].w;
      });
      // bar
      const barX = MARGIN + 2 + cols.slice(0, 5).reduce((a, c) => a + c.w, 0);
      const barW = cols[5].w - 6;
      miniBar(barX, y + 1.5, pct, barW, 4, 5, 150, 105);
      y += 7;
    });
    y += 4;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2 — WIN / LOSS BY SECTOR
  // ═══════════════════════════════════════════════════════════════════════
  checkPageBreak(20);
  sectionHeading("Win / Loss by Sector");

  if (data.winLossBySector.length === 0) {
    pdf.setFontSize(8); pdf.setTextColor(130, 130, 140);
    pdf.text("No closed deals recorded yet.", MARGIN, y + 4);
    y += 12;
  } else {
    const cols = [
      { label: "Sector", w: 60 },
      { label: "Wins", w: 22 },
      { label: "Losses", w: 22 },
      { label: "Total", w: 22 },
      { label: "Win Rate", w: 24 },
      { label: "Win Bar", w: CONTENT_W - 150 },
    ];
    tableHeader(cols, MARGIN);
    data.winLossBySector.forEach((s, i) => {
      const pct = s.total > 0 ? s.wins / s.total : 0;
      const winPct = Math.round(pct * 100);
      checkPageBreak(8);
      if (i % 2 === 1) {
        pdf.setFillColor(...ROW_ALT_BG);
        pdf.rect(MARGIN, y, CONTENT_W, 7, "F");
      }
      pdf.setFontSize(7.5); pdf.setFont("helvetica", "normal");
      const vals = [s.sector, String(s.wins), String(s.losses), String(s.total), `${winPct}%`];
      let cx = MARGIN + 2;
      vals.forEach((v, vi) => {
        if (vi === 4) {
          pdf.setTextColor(winPct >= 60 ? 5 : winPct >= 40 ? 160 : 220, winPct >= 60 ? 150 : winPct >= 40 ? 100 : 38, winPct >= 60 ? 105 : 38);
        } else {
          pdf.setTextColor(40, 40, 50);
        }
        pdf.text(v, cx, y + 4.8);
        cx += cols[vi].w;
      });
      const barX = MARGIN + 2 + cols.slice(0, 5).reduce((a, c) => a + c.w, 0);
      const barW = cols[5].w - 6;
      // Win (green) + loss overlay (red)
      pdf.setFillColor(230, 230, 235);
      pdf.roundedRect(barX, y + 1.5, barW, 4, 0.5, 0.5, "F");
      if (pct > 0) {
        pdf.setFillColor(5, 150, 105);
        pdf.roundedRect(barX, y + 1.5, Math.max(barW * pct, 1.5), 4, 0.5, 0.5, "F");
      }
      y += 7;
    });
    y += 4;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3 — MOST COMMON MISS THEMES
  // ═══════════════════════════════════════════════════════════════════════
  checkPageBreak(20);
  sectionHeading("Most Common Miss Themes");

  if (data.missThemes.length === 0) {
    pdf.setFontSize(8); pdf.setTextColor(130, 130, 140);
    pdf.text("No miss themes tagged yet.", MARGIN, y + 4);
    y += 12;
  } else {
    const maxCount = Math.max(...data.missThemes.map((t) => t.count), 1);
    const cols = [
      { label: "Theme", w: 80 },
      { label: "Count", w: 20 },
      { label: "Frequency Bar", w: CONTENT_W - 100 },
    ];
    tableHeader(cols, MARGIN);
    data.missThemes.forEach((t, i) => {
      const pct = t.count / maxCount;
      checkPageBreak(8);
      if (i % 2 === 1) {
        pdf.setFillColor(...ROW_ALT_BG);
        pdf.rect(MARGIN, y, CONTENT_W, 7, "F");
      }
      pdf.setFontSize(7.5); pdf.setFont("helvetica", "normal"); pdf.setTextColor(40, 40, 50);
      pdf.text(t.theme, MARGIN + 2, y + 4.8);
      pdf.text(String(t.count), MARGIN + 2 + 80, y + 4.8);
      const barX = MARGIN + 2 + 100;
      const barW = CONTENT_W - 104;
      miniBar(barX, y + 1.5, pct, barW, 4, 99, 102, 241);
      y += 7;
    });
    y += 4;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4 — RECENT CLOSURES
  // ═══════════════════════════════════════════════════════════════════════
  checkPageBreak(20);
  sectionHeading("Recent Closures");

  if (data.recentClosures.length === 0) {
    pdf.setFontSize(8); pdf.setTextColor(130, 130, 140);
    pdf.text("No closures recorded yet.", MARGIN, y + 4);
    y += 12;
  } else {
    const cols = [
      { label: "Deal", w: 48 },
      { label: "Sector", w: 34 },
      { label: "Stage", w: 22 },
      { label: "Phase 1", w: 30 },
      { label: "Close Reason", w: 36 },
      { label: "Miss Theme", w: CONTENT_W - 170 },
    ];
    tableHeader(cols, MARGIN);
    data.recentClosures.forEach((c, i) => {
      const accuracy = c.phase1VerdictAccuracy ?? "—";
      const row = [
        c.projectName ?? c.targetCode,
        c.sector ?? "—",
        c.currentStage,
        accuracy,
        c.closeReasonCode ?? "—",
        c.closeMissTheme ?? "—",
      ];
      tableRow(row, cols, MARGIN, i % 2 === 1, 7, "accent");

      // If there's a note, add it as a sub-row
      if (c.phase1VerdictNote) {
        checkPageBreak(6);
        pdf.setFontSize(6.5);
        pdf.setFont("helvetica", "italic");
        pdf.setTextColor(100, 100, 110);
        const noteLines = pdf.splitTextToSize(`Note: ${c.phase1VerdictNote}`, CONTENT_W - 4);
        pdf.text(noteLines.slice(0, 2), MARGIN + 2, y + 4);
        y += Math.min(noteLines.length, 2) * 4 + 2;
      }
    });
    y += 4;
  }

  drawPageFooter();
  return pdf;
}

// ── Page ───────────────────────────────────────────────────────────────────

const ACCURACY_THRESHOLD_KEY = "doctrine_accuracy_threshold";
const DEFAULT_THRESHOLD = 50;

function loadThreshold(): number {
  try {
    const stored = localStorage.getItem(ACCURACY_THRESHOLD_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_THRESHOLD;
}

export default function Doctrine() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState(new Date());
  const [isExporting, setIsExporting] = useState(false);
  const [granularity, setGranularity] = useState<"quarter" | "month">("quarter");
  const [rolling90, setRolling90] = useState(false);
  const [accuracyThreshold, setAccuracyThreshold] = useState<number>(loadThreshold);

  const handleThresholdChange = (value: number) => {
    const clamped = Math.max(1, Math.min(100, value));
    setAccuracyThreshold(clamped);
    try {
      localStorage.setItem(ACCURACY_THRESHOLD_KEY, String(clamped));
    } catch {
      // ignore
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["doctrine-summary", refreshKey],
    queryFn: () => customFetch<DoctrineSummary>("/api/doctrine/summary"),
  });

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    setRefreshedAt(new Date());
  };

  const handleExportPdf = async () => {
    if (!data || isExporting) return;
    setIsExporting(true);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 50)); // yield to paint loading state
      const pdf = buildDoctrinePdf(data);
      pdf.save(`ringside-doctrine-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const chartData = (data?.accuracyBySector ?? []).map((s) => ({
    sector: s.sector.length > 14 ? s.sector.slice(0, 12) + "…" : s.sector,
    fullSector: s.sector,
    Correct: s.correct,
    "Partially-correct": s.partiallyCorrect,
    Wrong: s.wrong,
  }));

  const cutoff90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const rawTrendData = granularity === "quarter"
    ? (data?.accuracyByQuarter ?? [])
    : (data?.accuracyByMonth ?? []);
  const accuracyTrendData = rolling90
    ? rawTrendData.filter((p) => new Date(p.periodStart).getTime() >= cutoff90)
    : rawTrendData;

  const hasVerdictData = (data?.recentClosures ?? []).some((c) => c.phase1VerdictAccuracy);

  const completedPeriods = accuracyTrendData.filter((p) => p.total > 0);
  let consecutiveLowCount = 0;
  for (let i = completedPeriods.length - 1; i >= 0; i--) {
    if (completedPeriods[i].accuracyPct < accuracyThreshold) {
      consecutiveLowCount++;
    } else {
      break;
    }
  }
  const showAccuracyAlert = consecutiveLowCount >= 2;

  return (
    <div className="flex flex-col h-full">
      <div className="page-hero px-4 md:px-6 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Lightbulb size={16} className="text-primary shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold font-sans tracking-tight">Doctrine</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 hidden md:block">
                Learning loop — Phase 1 accuracy patterns and deal closure analysis.
              </p>
            </div>
            <span className="metadata-label text-muted-foreground/40 hidden sm:inline mt-1">
              refreshed {format(refreshedAt, "h:mm a")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg font-mono text-[10px] uppercase shrink-0 border-border/60 h-7 px-2.5 gap-1.5"
              onClick={handleExportPdf}
              disabled={isLoading || !data || isExporting}
              title="Export as PDF"
            >
              {isExporting ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <FileDown size={11} />
              )}
              {isExporting ? "Exporting…" : "Export PDF"}
            </Button>
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

        {/* Panel 2 — Accuracy Over Time */}
        <Card className="border-border/60 bg-card rounded-xl">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <CardTitle className="font-mono uppercase tracking-tight text-sm">
                Accuracy Over Time
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Alert threshold control */}
                <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2 h-6" title="Alert fires when accuracy drops below this threshold for 2+ consecutive periods">
                  <span className="text-[10px] font-mono text-muted-foreground">Alert at</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={accuracyThreshold}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) handleThresholdChange(val);
                    }}
                    className="w-9 text-[10px] font-mono text-center bg-transparent border-none outline-none text-foreground"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground">%</span>
                </div>
                {/* Granularity toggle */}
                <div className="flex items-center rounded-lg border border-border/60 overflow-hidden text-[10px] font-mono">
                  <button
                    className={`px-2.5 h-6 transition-colors ${granularity === "quarter" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setGranularity("quarter")}
                  >
                    Quarter
                  </button>
                  <button
                    className={`px-2.5 h-6 transition-colors border-l border-border/60 ${granularity === "month" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setGranularity("month")}
                  >
                    Month
                  </button>
                </div>
                {/* 90-day window toggle */}
                <button
                  className={`h-6 px-2.5 rounded-lg border text-[10px] font-mono transition-colors ${rolling90 ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setRolling90((v) => !v)}
                  title="Show only the last 90 days"
                >
                  90d window
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : accuracyTrendData.length === 0 ? (
              <p className="text-[11px] text-muted-foreground font-mono py-6 text-center">
                {rolling90
                  ? "No verdicts recorded in the last 90 days."
                  : "No accuracy trend data yet — close deals with Phase 1 verdicts to populate this chart."}
              </p>
            ) : (
              <>
                {showAccuracyAlert && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/8 px-3.5 py-2.5 mb-3">
                    <TrendingDown size={14} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] font-mono text-amber-700 dark:text-amber-400 leading-relaxed">
                      Accuracy has been below{" "}
                      <span className="font-semibold">{accuracyThreshold}%</span>
                      {" "}for{" "}
                      <span className="font-semibold">{consecutiveLowCount} consecutive period{consecutiveLowCount !== 1 ? "s" : ""}</span>
                      {" "}— consider reviewing recent miss themes
                    </p>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={accuracyTrendData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fontFamily: "monospace" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v: number) => `${v}%`}
                      tick={{ fontSize: 10, fontFamily: "monospace" }}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                    />
                    <ReferenceLine
                      y={accuracyThreshold}
                      stroke="#6b7280"
                      strokeDasharray="4 3"
                      strokeWidth={1}
                      label={{ value: `${accuracyThreshold}%`, fontSize: 9, fill: "#9ca3af", fontFamily: "monospace", position: "right" }}
                    />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 11, fontFamily: "monospace", borderRadius: 6 }}
                      formatter={(value: number, name: string) => {
                        if (name === "accuracyPct") return [`${value}%`, "Correct %"];
                        return [value, name];
                      }}
                      labelFormatter={(label: string, payload) => {
                        const p = payload?.[0]?.payload as AccuracyByPeriod | undefined;
                        if (!p) return label;
                        return `${label} · ${p.total} deal${p.total === 1 ? "" : "s"} (${p.correct} correct, ${p.partiallyCorrect} partial, ${p.wrong} wrong)`;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="accuracyPct"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      name="accuracyPct"
                    />
                  </LineChart>
                </ResponsiveContainer>
                {/* Legend / summary strip */}
                <div className="flex flex-wrap gap-3 mt-3 px-1">
                  {accuracyTrendData.map((p) => (
                    <div key={p.period} className="flex flex-col items-center gap-0.5">
                      <span
                        className="text-[11px] font-mono font-medium"
                        style={{ color: p.accuracyPct >= 67 ? "#10b981" : p.accuracyPct >= 34 ? "#f59e0b" : "#ef4444" }}
                      >
                        {p.accuracyPct}%
                      </span>
                      <span className="text-[9px] font-mono text-muted-foreground/50">{p.period}</span>
                      <span className="text-[9px] font-mono text-muted-foreground/35">n={p.total}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Panel 3 — Win / Loss by Sector */}
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

        {/* Panel 3 — Most Common Miss Themes */}
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

        {/* Panel 4 — Recent Closures */}
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
