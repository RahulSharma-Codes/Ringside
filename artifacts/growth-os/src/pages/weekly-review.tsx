import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  ChevronDown, ChevronRight, RefreshCw, AlertTriangle, Clock,
  Target, ArrowRight, CalendarCheck, Zap,
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

interface WeeklyReviewData {
  mustWin: ReviewTarget[];
  needsAttention: ReviewTarget[];
  overdueActions: ReviewAction[];
  dueThisWeek: ReviewAction[];
  recentStageChanges: ReviewStageChange[];
  recentlyUpdated: ReviewTarget[];
  noOpenAction: ReviewTarget[];
  noRecentInteraction: ReviewTarget[];
}

// ── Small display helpers ──────────────────────────────────────────────────

function TierPill({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const cls =
    tier === "Must-Win"  ? "bg-primary/10 text-primary border-primary/30" :
    tier === "Priority 1" ? "bg-amber-500/10 text-amber-600 border-amber-500/30" :
    "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded-sm text-[10px] font-mono border ${cls}`}>
      {tier}
    </span>
  );
}

function StagePill({ stage }: { stage: string }) {
  return (
    <span className="text-[10px] font-mono text-muted-foreground border border-border px-1.5 py-0.5 rounded-sm">
      {stage}
    </span>
  );
}

// ── Card components ────────────────────────────────────────────────────────

function TargetCard({ t }: { t: ReviewTarget }) {
  return (
    <Link href={`/targets/${t.id}`}>
      <Card className="border-border bg-card/60 rounded-sm hover:bg-muted/40 transition-colors cursor-pointer">
        <CardContent className="p-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{t.projectName}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
              <span className="text-[10px] font-mono text-muted-foreground">{t.targetCode}</span>
              <TierPill tier={t.priorityTier} />
              <StagePill stage={t.currentStage} />
              {t.openActionCount !== undefined && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {t.openActionCount} open action{t.openActionCount !== 1 ? "s" : ""}
                </span>
              )}
              {t.lastInteractionDate && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  Last contact {format(parseISO(t.lastInteractionDate), "MMM d")}
                </span>
              )}
              {t.updatedAt && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  Updated {format(parseISO(t.updatedAt), "MMM d")}
                </span>
              )}
            </div>
          </div>
          <ArrowRight size={14} className="text-muted-foreground shrink-0" />
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
      <Card className="border-border bg-card/60 rounded-sm hover:bg-muted/40 transition-colors cursor-pointer">
        <CardContent className="p-3 space-y-1.5">
          <p className="text-sm font-medium leading-snug">{a.description}</p>
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
            <span className="text-[10px] font-mono text-muted-foreground">
              {a.owner ?? "Unassigned"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function StageChangeCard({ s }: { s: ReviewStageChange }) {
  return (
    <Link href={`/targets/${s.targetId}`}>
      <Card className="border-border bg-card/60 rounded-sm hover:bg-muted/40 transition-colors cursor-pointer">
        <CardContent className="p-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{s.targetName}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5 items-center text-[10px] font-mono text-muted-foreground">
              {s.targetCode && <span>{s.targetCode}</span>}
              <TierPill tier={s.priorityTier} />
              <span>{s.previousStage ?? "—"}</span>
              <ArrowRight size={10} className="shrink-0" />
              <span className="text-foreground font-semibold">{s.newStage}</span>
              {s.changedBy && <span>by {s.changedBy}</span>}
              {s.changedAt && <span>{format(parseISO(s.changedAt), "MMM d")}</span>}
            </div>
          </div>
          <ArrowRight size={14} className="text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({
  label, icon, emptyMsg, defaultOpen, count, children,
}: {
  label: string;
  icon: React.ReactNode;
  emptyMsg: string;
  defaultOpen: boolean;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-sm bg-card/30 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {open
          ? <ChevronDown size={14} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-[11px] font-mono uppercase tracking-wider font-semibold flex-1">{label}</span>
        <Badge variant={count > 0 ? "default" : "secondary"} className="text-[10px] font-mono shrink-0">
          {count}
        </Badge>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-border space-y-2">
          {count === 0 ? (
            <p className="text-[11px] text-muted-foreground font-mono py-1">{emptyMsg}</p>
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
      <div className="p-4 md:p-6 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarCheck size={18} className="text-primary" />
              <h1 className="text-xl font-bold font-mono tracking-tight uppercase">Weekly Review</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Pipeline cadence summary · refreshed {format(refreshedAt, "MMM d 'at' h:mm a")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-sm font-mono text-[11px] uppercase shrink-0"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw size={12} className={`mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-3">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-sm" />)
        ) : !d ? (
          <p className="text-muted-foreground text-sm font-mono">Failed to load review data.</p>
        ) : (
          <>
            <Section
              label="Must-Win Opportunities"
              icon={<Zap size={14} />}
              emptyMsg="No Must-Win opportunities in the active pipeline."
              defaultOpen
              count={d.mustWin.length}
            >
              {d.mustWin.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>

            <Section
              label="Needs Attention"
              icon={<AlertTriangle size={14} />}
              emptyMsg="All active opportunities look healthy — no attention flags."
              defaultOpen
              count={d.needsAttention.length}
            >
              {d.needsAttention.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>

            <Section
              label="Overdue Actions"
              icon={<AlertTriangle size={14} className="text-destructive" />}
              emptyMsg="No overdue actions — great pipeline hygiene."
              defaultOpen
              count={d.overdueActions.length}
            >
              {d.overdueActions.map((a) => <ActionCard key={a.id} a={a} />)}
            </Section>

            <Section
              label="Actions Due This Week"
              icon={<Clock size={14} />}
              emptyMsg="No actions due in the next 7 days."
              defaultOpen
              count={d.dueThisWeek.length}
            >
              {d.dueThisWeek.map((a) => <ActionCard key={a.id} a={a} />)}
            </Section>

            <Section
              label="Stage Changes — Last 7 Days"
              icon={<ArrowRight size={14} />}
              emptyMsg="No stage changes recorded in the past 7 days."
              defaultOpen
              count={d.recentStageChanges.length}
            >
              {d.recentStageChanges.map((s) => <StageChangeCard key={s.id} s={s} />)}
            </Section>

            <Section
              label="Recently Updated Opportunities"
              icon={<RefreshCw size={14} />}
              emptyMsg="No opportunities updated in the last 7 days."
              defaultOpen={false}
              count={d.recentlyUpdated.length}
            >
              {d.recentlyUpdated.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>

            <Section
              label="Opportunities Without Open Actions"
              icon={<Target size={14} />}
              emptyMsg="All active opportunities have at least one open action."
              defaultOpen={false}
              count={d.noOpenAction.length}
            >
              {d.noOpenAction.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>

            <Section
              label="No Interaction in 30+ Days"
              icon={<Clock size={14} />}
              emptyMsg="All opportunities have had recent contact — no cold deals."
              defaultOpen={false}
              count={d.noRecentInteraction.length}
            >
              {d.noRecentInteraction.map((t) => <TargetCard key={t.id} t={t} />)}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
