import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  ChevronDown, ChevronRight, RefreshCw, AlertTriangle, Clock,
  Target, ArrowRight, CalendarCheck, Zap, ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ──────────────────────────────────────────────────────────────────

interface ReviewTarget {
  id: number;
  targetCode: string;
  projectName: string;
  priorityTier: string;
  currentStage: string;
  openActionCount?: number;
  lastInteractionDate?: string | null;
  updatedAt?: string | null;
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
  currentStage: string;
}

interface ReviewStageChange {
  id: number;
  targetId: number;
  targetName: string;
  targetCode: string | null;
  priorityTier: string | null;
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

// ── Display helpers ────────────────────────────────────────────────────────

function TierPill({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const cls =
    tier === "Must-Win"   ? "bg-destructive/10 text-destructive border-destructive/25" :
    tier === "Priority 1" ? "bg-amber-500/10 text-amber-500 border-amber-500/25" :
    "bg-muted text-muted-foreground border-border/60";
  return <span className={`status-chip ${cls}`}>{tier}</span>;
}

function StagePill({ stage }: { stage: string }) {
  return <span className="status-chip text-muted-foreground border-border/60">{stage}</span>;
}

// ── Card components ────────────────────────────────────────────────────────

function TargetCard({ t, accent }: { t: ReviewTarget; accent?: "destructive" | "amber" }) {
  return (
    <Link href={`/targets/${t.id}`}>
      <Card className={`bg-card border-border/60 rounded-xl hover:shadow-sm transition-all duration-150 cursor-pointer group ${
        accent === "destructive" ? "border-l-2 border-l-destructive" :
        accent === "amber"       ? "border-l-2 border-l-amber-500" : ""
      }`}>
        <CardContent className="p-3.5 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{t.projectName}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
              <span className="metadata-label">{t.targetCode}</span>
              <TierPill tier={t.priorityTier} />
              <StagePill stage={t.currentStage} />
              {t.openActionCount !== undefined && t.openActionCount > 0 && (
                <span className="metadata-label text-amber-500">
                  {t.openActionCount} open action{t.openActionCount !== 1 ? "s" : ""}
                </span>
              )}
              {t.lastInteractionDate && (
                <span className="metadata-label">
                  Last contact {format(parseISO(t.lastInteractionDate), "MMM d")}
                </span>
              )}
              {t.updatedAt && (
                <span className="metadata-label">
                  Updated {format(parseISO(t.updatedAt), "MMM d")}
                </span>
              )}
            </div>
          </div>
          <ArrowRight size={13} className="text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
        </CardContent>
      </Card>
    </Link>
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
            <StagePill stage={a.currentStage} />
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
              <StagePill stage={t.currentStage} />
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
              <span className="metadata-label">{s.previousStage ?? "—"}</span>
              <ArrowRight size={9} className="text-muted-foreground shrink-0" />
              <span className="text-[10px] font-mono font-semibold text-primary">{s.newStage}</span>
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
  label, icon, emptyMsg, defaultOpen, count, urgency, children,
}: {
  label: string;
  icon: React.ReactNode;
  emptyMsg: string;
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
            <div className="border border-dashed border-border/50 rounded-lg py-4 px-3">
              <p className="text-[11px] text-muted-foreground font-mono">{emptyMsg}</p>
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function WeeklyReview() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  const { data, isLoading } = useQuery({
    queryKey: ["weekly-review", refreshKey],
    queryFn: () => customFetch<WeeklyReviewData>("/api/review/weekly"),
  });

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    setRefreshedAt(new Date());
  };

  const d = data;

  return (
    <div className="flex flex-col h-full">
      {/* Compact sticky header */}
      <div className="page-hero px-4 md:px-6 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CalendarCheck size={16} className="text-primary shrink-0" />
            <h1 className="text-lg font-bold font-mono tracking-tight">Weekly Review</h1>
            <span className="metadata-label text-muted-foreground/40 hidden sm:inline">
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

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-2.5">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
        ) : !d ? (
          <p className="text-muted-foreground text-sm font-mono">Failed to load review data.</p>
        ) : (
          <>
            <Section label="Must-Win Opportunities" icon={<Zap size={13} className="text-destructive" />}
              emptyMsg="No Must-Win opportunities in the active pipeline."
              defaultOpen urgency="high" count={d.mustWin.length}>
              {d.mustWin.map((t) => <TargetCard key={t.id} t={t} accent="destructive" />)}
            </Section>

            <Section label="Needs Attention" icon={<AlertTriangle size={13} />}
              emptyMsg="All active opportunities look healthy — no attention flags."
              defaultOpen urgency="high" count={d.needsAttention.length}>
              {d.needsAttention.map((t) => <TargetCard key={t.id} t={t} accent="destructive" />)}
            </Section>

            <Section label="Overdue Actions" icon={<AlertTriangle size={13} />}
              emptyMsg="No overdue actions — great pipeline hygiene."
              defaultOpen urgency="high" count={d.overdueActions.length}>
              {d.overdueActions.map((a) => <ActionCard key={a.id} a={a} />)}
            </Section>

            <Section label="Actions Due This Week" icon={<Clock size={13} />}
              emptyMsg="No actions due in the next 7 days."
              defaultOpen urgency="medium" count={d.dueThisWeek.length}>
              {d.dueThisWeek.map((a) => <ActionCard key={a.id} a={a} />)}
            </Section>

            <Section label="Stage Changes — Last 7 Days" icon={<ArrowRight size={13} />}
              emptyMsg="No stage changes recorded in the past 7 days."
              defaultOpen count={d.recentStageChanges.length}>
              {d.recentStageChanges.map((s) => <StageChangeCard key={s.id} s={s} />)}
            </Section>

            <Section label="Recently Updated Opportunities" icon={<RefreshCw size={13} />}
              emptyMsg="No opportunities updated in the last 7 days."
              defaultOpen={false} count={d.recentlyUpdated.length}>
              {d.recentlyUpdated.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>

            <Section label="Opportunities Without Open Actions" icon={<Target size={13} />}
              emptyMsg="All active opportunities have at least one open action."
              defaultOpen={false} count={d.noOpenAction.length}>
              {d.noOpenAction.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>

            <Section label="No Interaction in 30+ Days" icon={<Clock size={13} />}
              emptyMsg="All opportunities have had recent contact — no cold deals."
              defaultOpen={false} count={d.noRecentInteraction.length}>
              {d.noRecentInteraction.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>

            <Section label="Diligence Health" icon={<ShieldAlert size={13} />}
              emptyMsg="All Must-Win diligence is on track — no blocked or low-completion items."
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
