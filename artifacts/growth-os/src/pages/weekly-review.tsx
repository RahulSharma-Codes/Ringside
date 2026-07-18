import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { downloadAuthenticatedFile } from "@/lib/download";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  ChevronDown, ChevronRight, RefreshCw, AlertTriangle, Clock,
  Target, ArrowRight, CalendarCheck, Zap, ShieldAlert,
  Sparkles, Loader2, Copy, Check, Bot, X, Download, Filter, LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StageChip } from "@/components/stage-chip";
import { HealthDot } from "@/components/health-dot";
import { DealCard, type DealCardData } from "@/components/deal-card";
import { SkeletonCard } from "@/components/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────

interface ReviewTarget {
  id: number;
  targetCode: string;
  projectName: string;
  priorityTier: string;
  dealType?: string | null;
  currentStage: string;
  openActionCount?: number;
  lastInteractionDate?: string | null;
  updatedAt?: string | null;
  healthScore?: "healthy" | "watch" | "at_risk" | null;
}

interface ReviewAction {
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
  dealType?: string | null;
  currentStage: string;
}

interface ReviewStageChange {
  id: number;
  targetId: number;
  targetName: string;
  targetCode: string | null;
  priorityTier: string | null;
  dealType?: string | null;
  previousStage: string | null;
  newStage: string;
  changedBy: string | null;
  changedAt: string | null;
}

interface DiligenceHealthTarget {
  id: number;
  targetCode: string;
  projectName: string;
  priorityTier: string;
  dealType?: string | null;
  currentStage: string;
  total: number;
  completed: number;
  pct: number;
  blocked: number;
}

interface DiligenceHealth {
  lowCompletionMustWin: DiligenceHealthTarget[];
  blockedTargets: DiligenceHealthTarget[];
}

interface WeeklyReviewData {
  mustWin: ReviewTarget[];
  needsAttention: ReviewTarget[];
  overdueActions: ReviewAction[];
  dueThisWeek: ReviewAction[];
  recentStageChanges: ReviewStageChange[];
  recentlyUpdated: ReviewTarget[];
  noOpenAction: ReviewTarget[];
  noRecentInteraction: ReviewTarget[];
  diligenceHealth: DiligenceHealth;
}

interface FiltersData {
  dealTypes: string[];
}

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

// ── Display helpers ────────────────────────────────────────────────────────

function TierPill({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const cls =
    tier === "Must-Win"   ? "bg-destructive/10 text-destructive border-destructive/25" :
    tier === "Priority 1" ? "bg-amber-500/10 text-amber-500 border-amber-500/25" :
    "bg-muted text-muted-foreground border-border/60";
  return <span className={`status-chip ${cls}`}>{tier}</span>;
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  "JV": "JV",
  "Partnership": "Partner",
  "Strategic Alliance": "Alliance",
};

function DealTypeBadge({ dealType }: { dealType?: string | null }) {
  if (!dealType) return null;
  const label = DEAL_TYPE_LABELS[dealType];
  if (!label) return null;
  return (
    <span className="status-chip bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30">
      {label}
    </span>
  );
}

// ── Card components ────────────────────────────────────────────────────────

function TargetCard({ t, accent }: { t: ReviewTarget; accent?: "destructive" | "amber" }) {
  const deal: DealCardData = {
    id: t.id,
    targetCode: t.targetCode,
    projectName: t.projectName,
    currentStage: t.currentStage,
    priorityTier: t.priorityTier,
    healthScore: t.healthScore as DealCardData["healthScore"],
  };
  return (
    <DealCard deal={deal} animDelay={0}>
      {(t.openActionCount !== undefined && t.openActionCount > 0) || t.lastInteractionDate || t.updatedAt || t.dealType ? (
        <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
          <DealTypeBadge dealType={t.dealType} />
          {t.openActionCount !== undefined && t.openActionCount > 0 && (
            <span className="metadata-label text-amber-500">
              {t.openActionCount} open action{t.openActionCount !== 1 ? "s" : ""}
            </span>
          )}
          {t.lastInteractionDate && (
            <span className="metadata-label">
              Contact {format(parseISO(t.lastInteractionDate), "MMM d")}
            </span>
          )}
          {t.updatedAt && !t.lastInteractionDate && (
            <span className="metadata-label">
              Updated {format(parseISO(t.updatedAt), "MMM d")}
            </span>
          )}
        </div>
      ) : null}
    </DealCard>
  );
}

function ActionCard({ a }: { a: ReviewAction }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const isOverdue = a.dueDate && a.dueDate < todayStr;
  return (
    <Link href={`/targets/${a.targetId}`}>
      <Card className={`bg-card border-border/60 rounded-xl hover:shadow-sm transition-all duration-150 cursor-pointer group ${isOverdue ? "border-l-2 border-l-destructive bg-destructive/5" : ""}`}>
        <CardContent className="p-3.5 space-y-1.5">
          <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">{a.description}</p>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] font-mono text-primary">
              {a.targetName}{a.targetCode ? ` · ${a.targetCode}` : ""}
            </span>
            <TierPill tier={a.priorityTier} />
            <DealTypeBadge dealType={a.dealType} />
            <StageChip stage={a.currentStage} size="xs" />
            {a.dueDate && (
              <span className={`flex items-center gap-1 text-[10px] font-mono ${isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                <Clock size={10} />
                {isOverdue && <AlertTriangle size={10} />}
                {format(parseISO(a.dueDate), "MMM d")}
              </span>
            )}
            <span className="metadata-label">{a.owner ?? "Unassigned"}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function DiligenceTargetCard({ t }: { t: DiligenceHealthTarget }) {
  return (
    <Link href={`/targets/${t.id}`}>
      <Card className="bg-card border-border/60 rounded-xl hover:shadow-sm transition-all duration-150 cursor-pointer group">
        <CardContent className="p-3.5 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{t.projectName}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
              <span className="metadata-label">{t.targetCode}</span>
              <TierPill tier={t.priorityTier} />
              <DealTypeBadge dealType={t.dealType} />
              <StageChip stage={t.currentStage} size="xs" />
              <span className="metadata-label">{t.completed}/{t.total} done ({t.pct}%)</span>
              {t.blocked > 0 && (
                <span className="text-[10px] font-mono text-destructive font-semibold">{t.blocked} blocked</span>
              )}
            </div>
            <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden w-full max-w-[160px]">
              <div
                className={`h-full rounded-full ${
                  t.pct === 100 ? "bg-emerald-500" : t.pct >= 60 ? "bg-primary" : t.pct >= 30 ? "bg-amber-500" : "bg-destructive"
                }`}
                style={{ width: `${t.pct}%` }}
              />
            </div>
          </div>
          <ArrowRight size={13} className="text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
        </CardContent>
      </Card>
    </Link>
  );
}

function StageChangeCard({ s }: { s: ReviewStageChange }) {
  return (
    <Link href={`/targets/${s.targetId}`}>
      <Card className="bg-card border-border/60 rounded-xl hover:shadow-sm transition-all duration-150 cursor-pointer group">
        <CardContent className="p-3.5 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.targetName}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
              {s.targetCode && <span className="metadata-label">{s.targetCode}</span>}
              <TierPill tier={s.priorityTier} />
              <DealTypeBadge dealType={s.dealType} />
              {s.previousStage && <StageChip stage={s.previousStage} size="xs" />}
              <ArrowRight size={9} className="text-muted-foreground shrink-0" />
              <StageChip stage={s.newStage} size="xs" />
              {s.changedBy && <span className="metadata-label">by {s.changedBy}</span>}
              {s.changedAt && <span className="metadata-label">{format(parseISO(s.changedAt), "MMM d")}</span>}
            </div>
          </div>
          <ArrowRight size={13} className="text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({
  label, icon, emptyMsg, emptyIcon, defaultOpen, count, urgency, children,
}: {
  label: string;
  icon: React.ReactNode;
  emptyMsg: string;
  emptyIcon: LucideIcon;
  defaultOpen: boolean;
  count: number;
  urgency?: "high" | "medium" | "low";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const headerCls =
    urgency === "high"   ? "group-header-overdue" :
    urgency === "medium" ? "group-header-thisweek" :
    "";

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`section-header rounded-t-xl ${headerCls}`}
      >
        {open
          ? <ChevronDown size={13} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
        <span className="text-muted-foreground/70 shrink-0">{icon}</span>
        <span className="text-[11px] font-mono uppercase tracking-wider font-semibold flex-1 text-left">{label}</span>
        <Badge
          variant={count > 0 ? "default" : "secondary"}
          className={`text-[10px] font-mono shrink-0 ml-auto ${
            urgency === "high" && count > 0 ? "bg-destructive text-white border-0" :
            urgency === "medium" && count > 0 ? "bg-amber-500 text-white border-0" : ""
          }`}
        >
          {count}
        </Badge>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-border/40 bg-background/20 space-y-2">
          {count === 0 ? (
            <EmptyState icon={emptyIcon} title={emptyMsg} size="sm" />
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

interface BriefState {
  open: boolean;
  loading: boolean;
  content: string | null;
  setupRequired: boolean;
  billingRequired: boolean;
  copied: boolean;
  error: string | null;
}

export default function WeeklyReview() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState(new Date());
  const [dealTypeFilter, setDealTypeFilter] = useState(() => getUrlParam("dealType"));

  const [brief, setBrief] = useState<BriefState>({
    open: false, loading: false, content: null,
    setupRequired: false, billingRequired: false, copied: false, error: null,
  });

  // Sync dealType filter to URL
  useEffect(() => {
    setUrlParam("dealType", dealTypeFilter);
  }, [dealTypeFilter]);

  const reviewUrl = dealTypeFilter
    ? `/api/review/weekly?dealType=${encodeURIComponent(dealTypeFilter)}`
    : "/api/review/weekly";

  const { data, isLoading } = useQuery({
    queryKey: ["weekly-review", refreshKey, dealTypeFilter],
    queryFn: () => customFetch<WeeklyReviewData>(reviewUrl),
  });

  // Fetch available deal types for the filter dropdown
  const { data: filtersData } = useQuery({
    queryKey: ["targets-filters"],
    queryFn: () => customFetch<FiltersData>("/api/targets/filters"),
    staleTime: 5 * 60 * 1000,
  });
  const availableDealTypes = filtersData?.dealTypes ?? [];

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    setRefreshedAt(new Date());
  };

  // Auto-trigger when Copilot navigates here with ?ai=brief
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ai") === "brief") {
      handleGenerateBrief();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateBrief = async () => {
    setBrief((b) => ({ ...b, open: true, loading: true, content: null, setupRequired: false, billingRequired: false, error: null }));
    try {
      const resp = await customFetch<{
        brief: string | null;
        setupRequired?: boolean;
        billingRequired?: boolean;
        error?: string;
      }>("/api/ai/weekly-brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (resp.setupRequired) { setBrief((b) => ({ ...b, loading: false, setupRequired: true })); return; }
      if (resp.billingRequired) { setBrief((b) => ({ ...b, loading: false, billingRequired: true })); return; }
      setBrief((b) => ({ ...b, loading: false, content: resp.brief ?? "No brief generated." }));
    } catch (err) {
      setBrief((b) => ({ ...b, loading: false, error: err instanceof Error ? err.message : "Failed to generate brief." }));
    }
  };

  const handleCopyBrief = () => {
    if (!brief.content) return;
    navigator.clipboard.writeText(brief.content).catch(() => {});
    setBrief((b) => ({ ...b, copied: true }));
    setTimeout(() => setBrief((b) => ({ ...b, copied: false })), 2000);
  };

  const d = data;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Compact sticky header */}
      <div className="page-hero px-4 md:px-6 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CalendarCheck size={16} className="text-primary shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold font-sans tracking-tight">Weekly Review</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 hidden md:block font-sans">What moved, what is blocked, and what needs attention before the next leadership discussion.</p>
            </div>
            <span className="metadata-label text-muted-foreground/40 hidden sm:inline mt-1">
              refreshed {format(refreshedAt, "h:mm a")}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl font-sans text-[11px] shrink-0 border-border/60 h-7 px-2.5 gap-1.5"
              onClick={() => { downloadAuthenticatedFile("/api/export/weekly-review", "weekly-review.pdf").catch(() => {}); }}
            >
              <Download size={11} /> Export PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl font-sans text-[11px] shrink-0 border-primary/30 text-primary hover:bg-primary/5 h-7 px-2.5 gap-1.5 flex"
              onClick={handleGenerateBrief}
              disabled={brief.loading}
            >
              {brief.loading
                ? <Loader2 size={11} className="animate-spin" />
                : <Sparkles size={11} />}
              AI Brief
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl font-sans text-[11px] shrink-0 border-border/60 h-7 px-2.5 gap-1.5"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw size={11} className={isLoading ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
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

      {/* AI Weekly Brief Panel */}
      {brief.open && (
        <div className="shrink-0 mx-4 mt-3 border border-primary/20 bg-primary/5 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-primary/15">
            <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Bot size={12} className="text-primary" />
            </div>
            <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-primary/80 flex-1">
              AI Weekly Review Brief
            </span>
            {brief.content && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                onClick={handleCopyBrief}
              >
                {brief.copied ? <Check size={11} /> : <Copy size={11} />}
                {brief.copied ? "Copied" : "Copy"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setBrief((b) => ({ ...b, open: false }))}
            >
              <X size={12} />
            </Button>
          </div>
          <div className="px-4 py-4">
            {brief.loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 size={14} className="animate-spin" />
                Generating AI brief from pipeline data…
              </div>
            )}
            {!brief.loading && brief.setupRequired && (
              <p className="text-sm text-muted-foreground">
                AI not configured. Add an <code className="text-xs font-mono bg-muted px-1 rounded">OPENAI_API_KEY</code> to enable AI briefs.
              </p>
            )}
            {!brief.loading && brief.billingRequired && (
              <p className="text-sm text-amber-600">
                AI workflows are ready — add OpenAI API credits to activate them.
              </p>
            )}
            {!brief.loading && brief.error && (
              <p className="text-sm text-destructive">{brief.error}</p>
            )}
            {!brief.loading && brief.content && !brief.setupRequired && !brief.billingRequired && (
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 max-h-96 overflow-y-auto">
                {brief.content}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-2.5">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)
        ) : !d ? (
          <p className="text-muted-foreground text-sm font-mono">Failed to load review data.</p>
        ) : (
          <>
            <Section label="Must-Win Opportunities" icon={<Zap size={13} className="text-destructive" />}
              emptyMsg="No Must-Win opportunities in the active pipeline."
              emptyIcon={Zap}
              defaultOpen urgency="high" count={d.mustWin.length}>
              {d.mustWin.map((t) => <TargetCard key={t.id} t={t} accent="destructive" />)}
            </Section>

            <Section label="Needs Attention" icon={<AlertTriangle size={13} />}
              emptyMsg="All active opportunities look healthy — no attention flags."
              emptyIcon={AlertTriangle}
              defaultOpen urgency="high" count={d.needsAttention.length}>
              {d.needsAttention.map((t) => <TargetCard key={t.id} t={t} accent="destructive" />)}
            </Section>

            <Section label="Overdue Actions" icon={<AlertTriangle size={13} />}
              emptyMsg="No overdue actions — great pipeline hygiene."
              emptyIcon={AlertTriangle}
              defaultOpen urgency="high" count={d.overdueActions.length}>
              {d.overdueActions.map((a) => <ActionCard key={a.id} a={a} />)}
            </Section>

            <Section label="Actions Due This Week" icon={<Clock size={13} />}
              emptyMsg="No actions due in the next 7 days."
              emptyIcon={Clock}
              defaultOpen urgency="medium" count={d.dueThisWeek.length}>
              {d.dueThisWeek.map((a) => <ActionCard key={a.id} a={a} />)}
            </Section>

            <Section label="Stage Changes — Last 7 Days" icon={<ArrowRight size={13} />}
              emptyMsg="No stage changes recorded in the past 7 days."
              emptyIcon={ArrowRight}
              defaultOpen count={d.recentStageChanges.length}>
              {d.recentStageChanges.map((s) => <StageChangeCard key={s.id} s={s} />)}
            </Section>

            <Section label="Recently Updated Opportunities" icon={<RefreshCw size={13} />}
              emptyMsg="No opportunities updated in the last 7 days."
              emptyIcon={RefreshCw}
              defaultOpen={false} count={d.recentlyUpdated.length}>
              {d.recentlyUpdated.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>

            <Section label="Opportunities Without Open Actions" icon={<Target size={13} />}
              emptyMsg="All active opportunities have at least one open action."
              emptyIcon={Target}
              defaultOpen={false} count={d.noOpenAction.length}>
              {d.noOpenAction.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>

            <Section label="No Interaction in 30+ Days" icon={<Clock size={13} />}
              emptyMsg="All opportunities have had recent contact — no cold deals."
              emptyIcon={Clock}
              defaultOpen={false} count={d.noRecentInteraction.length}>
              {d.noRecentInteraction.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>

            <Section label="Diligence Health" icon={<ShieldAlert size={13} />}
              emptyMsg="All Must-Win diligence is on track — no blocked or low-completion items."
              emptyIcon={ShieldAlert}
              defaultOpen
              count={new Set([
                ...d.diligenceHealth.lowCompletionMustWin.map((t) => t.id),
                ...d.diligenceHealth.blockedTargets.map((t) => t.id),
              ]).size}>
              {d.diligenceHealth.lowCompletionMustWin.length > 0 && (
                <div className="space-y-2">
                  <p className="metadata-label pt-1">Must-Win · Below 50% Complete</p>
                  {d.diligenceHealth.lowCompletionMustWin.map((t) => (
                    <DiligenceTargetCard key={`low-${t.id}`} t={t} />
                  ))}
                </div>
              )}
              {d.diligenceHealth.blockedTargets.length > 0 && (
                <div className="space-y-2">
                  <p className="metadata-label pt-1">Blocked Diligence Items</p>
                  {d.diligenceHealth.blockedTargets.map((t) => (
                    <DiligenceTargetCard key={`blocked-${t.id}`} t={t} />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
