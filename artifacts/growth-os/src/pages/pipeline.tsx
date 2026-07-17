import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  useListTargets, getListTargetsQueryKey,
  useGetTargetFilterOptions, getGetTargetFilterOptionsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, ChevronRight, AlertTriangle, Calendar, Zap, User, MapPin, Upload, Download, Sparkles, LayoutList, LayoutGrid } from "lucide-react";
import { ExportDialog } from "@/components/export-dialog";
import { QuickLogInteractionPopover } from "@/components/quick-log-interaction-popover";
import { MobileLongPressTray } from "@/components/mobile-long-press-tray";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { StageChip } from "@/components/stage-chip";
import { HealthDot } from "@/components/health-dot";
import { PIPELINE_STAGE_ORDER } from "@/components/stage-rail";
import { PipelineKanban } from "@/pages/pipeline-kanban";
import { PipelineListTable } from "@/pages/pipeline-list-table";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

const STAGES = [
  "Sourcing", "Outreach", "Introductory Discussion", "NDA / CIM",
  "Preliminary Due Diligence", "Management Meeting", "Non-Binding Offer",
  "Confirmatory Due Diligence", "Binding Offer", "SPA Negotiation",
  "Integration Planning", "On Hold",
];

const TIERS = ["Must-Win", "Priority 1", "Priority 2", "Watchlist", "On Hold", "Dropped"];

const NON_DEFAULT_DEAL_TYPES: Record<string, string> = {
  "JV": "JV",
  "Partnership": "Partner",
  "Strategic Alliance": "Alliance",
};

const DEAL_TYPES = [
  "Acquisition",
  "Minority Investment",
  "Divestiture",
  "JV",
  "Partnership",
  "Strategic Alliance",
  "Other",
];

const VIEW_STORAGE_KEY = "ringside_pipeline_view";
const MY_DEALS_STORAGE_KEY = "pipeline_my_deals";
const LONG_PRESS_HINT_KEY = "pipeline_long_press_hint_shown";

function getTierBadgeColor(tier: string) {
  switch (tier) {
    case "Must-Win":  return "bg-destructive text-destructive-foreground border-0";
    case "Priority 1": return "bg-amber-500 text-white border-0";
    case "Priority 2": return "bg-primary text-primary-foreground border-0";
    case "Watchlist":  return "bg-muted text-muted-foreground border-border";
    default:           return "bg-secondary text-secondary-foreground border-0";
  }
}

function getTierCardClass(tier: string) {
  switch (tier) {
    case "Must-Win":   return "tier-must-win";
    case "Priority 1": return "tier-p1";
    case "Priority 2": return "tier-p2";
    default:           return "";
  }
}

type PipelineView = "list" | "board";

export default function Pipeline() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<PipelineView>(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      return stored === "board" ? "board" : "list";
    } catch {
      return "list";
    }
  });

  const [myDeals, setMyDeals] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MY_DEALS_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const handleMyDealsToggle = (next: boolean) => {
    setMyDeals(next);
    try { localStorage.setItem(MY_DEALS_STORAGE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
  };

  const [search, setSearch]               = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") ?? "";
  });
  const [stage, setStage]                 = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("stage");
    return s && s.trim().length > 0 ? s.trim() : "all";
  });
  const [tier, setTier]                   = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tier");
    return t && t.trim().length > 0 ? t.trim() : "all";
  });
  const [owner, setOwner]                 = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const o = params.get("owner");
    return o && o.trim().length > 0 ? o.trim() : "all";
  });
  const [country, setCountry]             = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("country");
    return c && c.trim().length > 0 ? c.trim() : "all";
  });
  const [attentionOnly, setAttentionOnly] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("attention") === "1";
  });
  const [dealType, setDealType]           = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const dt = params.get("dealType");
    return dt && dt.trim().length > 0 ? dt.trim() : "all";
  });
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search)              params.set("search", search);
    if (stage !== "all")     params.set("stage", stage);
    if (tier !== "all")      params.set("tier", tier);
    if (owner !== "all")     params.set("owner", owner);
    if (country !== "all")   params.set("country", country);
    if (attentionOnly)       params.set("attention", "1");
    if (dealType !== "all")  params.set("dealType", dealType);
    const qs = params.toString();
    const newUrl = qs ? `/pipeline?${qs}` : "/pipeline";
    window.history.replaceState(null, "", newUrl);
  }, [search, stage, tier, owner, country, attentionOnly, dealType]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const alreadySeen = !!localStorage.getItem(LONG_PRESS_HINT_KEY);
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      if (!alreadySeen && isTouch) {
        timer = setTimeout(() => {
          toast({
            title: "Tip: hold a card to log an interaction",
            description: "Long-press any deal card to quickly log a call, meeting, or email.",
            duration: 5000,
          });
          try { localStorage.setItem(LONG_PRESS_HINT_KEY, "1"); } catch { /* ignore */ }
        }, 1200);
      }
    } catch { /* ignore */ }
    return () => { if (timer !== undefined) clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleViewChange = (newView: PipelineView) => {
    setView(newView);
    try { localStorage.setItem(VIEW_STORAGE_KEY, newView); } catch { /* ignore */ }
  };

  const { data: filterOptions } = useGetTargetFilterOptions({
    query: { queryKey: getGetTargetFilterOptionsQueryKey() },
  });

  const { data: targets, isLoading } = useListTargets(
    {
      search:         search || undefined,
      stage:          stage !== "all" ? stage : undefined,
      priorityTier:   tier !== "all" ? tier : undefined,
      owner:          (!myDeals && owner !== "all") ? owner : undefined,
      country:        country !== "all" ? country : undefined,
      needsAttention: attentionOnly ? true : undefined,
      dealType:       dealType !== "all" ? dealType : undefined,
      isActive:       stage !== "Closed" && stage !== "Dropped" ? true : undefined,
      myDeals:        myDeals ? true : undefined,
    },
    {
      query: {
        queryKey: getListTargetsQueryKey({ search, stage, priorityTier: tier, owner, country, needsAttention: attentionOnly, dealType, myDeals }),
      },
    },
  );

  const hasActiveFilters = search || stage !== "all" || tier !== "all" || owner !== "all" || country !== "all" || attentionOnly || dealType !== "all" || myDeals;

  const aiMode = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("ai") as "meeting-notes" | "opportunity-brief" | null;
  })();

  function clearFilters() {
    setSearch(""); setStage("all"); setTier("all"); setOwner("all"); setCountry("all"); setAttentionOnly(false); setDealType("all"); handleMyDealsToggle(false);
  }

  return (
    <div className="pb-20 md:pb-8">

      {/* Sticky header + filter bar */}
      <div className="page-hero-sticky px-4 md:px-6 pt-4 pb-3 space-y-3">
        {/* Title row */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight flex items-center gap-2">
              Inorganic Growth Pipeline
              {targets && !isLoading && (
                <span className="text-[11px] font-normal text-muted-foreground/60 font-mono">{targets.length}</span>
              )}
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5 hidden md:block">Track, prioritize, and progress opportunities from origination through diligence, offer, closing, and integration planning.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* View toggle */}
            <div className="flex items-center border border-border/60 rounded-lg overflow-hidden h-7">
              <button
                onClick={() => handleViewChange("list")}
                title="List view"
                className={`flex items-center justify-center w-7 h-7 transition-colors ${
                  view === "list"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <LayoutList size={12} />
              </button>
              <button
                onClick={() => handleViewChange("board")}
                title="Board view"
                className={`flex items-center justify-center w-7 h-7 transition-colors ${
                  view === "board"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <LayoutGrid size={12} />
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="rounded-lg font-mono uppercase tracking-wider text-[10px] gap-1.5 border-border/60 h-7 px-2.5"
              onClick={() => setExportDialogOpen(true)}
            >
              <Download size={11} /> Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg font-mono uppercase tracking-wider text-[10px] gap-1.5 border-border/60 h-7 px-2.5"
              onClick={() => navigate("/import")}
            >
              <Upload size={11} /> Import
            </Button>
            <Link href="/targets/new">
              <Button size="sm" className="rounded-lg font-mono uppercase tracking-wider text-[10px] gap-1.5 h-7 px-2.5">
                <Plus size={12} /> New
              </Button>
            </Link>
          </div>
        </div>

        {/* My Deals / All Deals toggle */}
        {user && (
          <div className="flex items-center border border-border/60 rounded-lg overflow-hidden h-7 self-start">
            <button
              onClick={() => handleMyDealsToggle(false)}
              className={`px-3 h-7 text-[11px] font-mono transition-colors ${
                !myDeals ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              All Deals
            </button>
            <button
              onClick={() => handleMyDealsToggle(true)}
              className={`px-3 h-7 text-[11px] font-mono transition-colors ${
                myDeals ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              My Deals
            </button>
          </div>
        )}

        {/* Single-row filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[140px] max-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
            <Input
              placeholder="Search…"
              className="pl-8 rounded-lg font-mono text-xs bg-background/60 border-border/60 h-7"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="w-[150px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-7">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent className="font-mono text-[11px] uppercase">
              <SelectItem value="all">All Stages</SelectItem>
              {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger className="w-[120px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-7">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent className="font-mono text-[11px] uppercase">
              <SelectItem value="all">All Tiers</SelectItem>
              {TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          {(filterOptions?.owners?.length ?? 0) > 0 && (
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="w-[120px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-7">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent className="font-mono text-[11px] uppercase">
                <SelectItem value="all">All Owners</SelectItem>
                {filterOptions!.owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {(filterOptions?.countries?.length ?? 0) > 0 && (
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="w-[120px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-7">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent className="font-mono text-[11px] uppercase">
                <SelectItem value="all">All Countries</SelectItem>
                {filterOptions!.countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Select value={dealType} onValueChange={setDealType}>
            <SelectTrigger className="w-[130px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-7">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="font-mono text-[11px]">
              <SelectItem value="all">All Types</SelectItem>
              {DEAL_TYPES.map((dt) => <SelectItem key={dt} value={dt}>{dt}</SelectItem>)}
            </SelectContent>
          </Select>

          <button
            onClick={() => setAttentionOnly(!attentionOnly)}
            className={`h-7 px-2.5 rounded-lg text-[11px] font-mono border transition-all duration-150 flex items-center gap-1.5 shrink-0 ${
              attentionOnly
                ? "bg-destructive/15 text-destructive border-destructive/40"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle size={10} /> Attn
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="h-7 px-2.5 rounded-lg text-[11px] font-mono text-muted-foreground/60 hover:text-muted-foreground border border-dashed border-border/40 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* AI workflow banner */}
      {aiMode && (
        <div className="mx-4 md:mx-6 mt-3 px-3.5 py-2.5 rounded-xl border border-primary/20 bg-primary/5 text-[11px] font-mono flex items-center gap-2 text-primary">
          <Sparkles size={12} className="shrink-0" />
          <span>
            {aiMode === "meeting-notes"
              ? "Select a target below to open the AI meeting notes parser."
              : "Select a target below to generate an AI opportunity brief."}
          </span>
        </div>
      )}

      {/* ── Board view ── */}
      {view === "board" && !isLoading && (
        <div className="px-4 md:px-6 pt-4">
          {(targets?.length ?? 0) === 0 && hasActiveFilters ? (
            <div className="border border-dashed border-border rounded-xl py-16 text-center">
              <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
                No targets match the selected filters
              </p>
              <Button variant="outline" size="sm" className="mt-4 rounded-lg font-mono text-[10px] uppercase" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          ) : (
            <PipelineKanban targets={targets ?? []} aiMode={aiMode} stageFilter={stage} dealTypeFilter={dealType} />
          )}
        </div>
      )}

      {view === "board" && isLoading && (
        <div className="px-4 md:px-6 pt-4 flex gap-2.5 overflow-hidden">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="shrink-0 w-[220px] space-y-2">
              <Skeleton className="h-8 w-full rounded-t-lg" />
              <Skeleton className="h-24 w-full rounded-b-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* ── List view ── */}
      {view === "list" && (
        <div className="p-4 md:p-6 space-y-2.5">
          {isLoading ? (
            <div className="space-y-3">
              {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-[130px] w-full rounded-xl" />)}
            </div>
          ) : (targets?.length ?? 0) === 0 ? (
            <Card className="bg-card border-border rounded-xl">
              <CardContent className="p-12 text-center">
                <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">
                  No targets match the selected filters
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" className="mt-4 rounded-lg font-mono text-[10px] uppercase" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <PipelineListTable
              data={(targets ?? []).map((t) => ({
                id: t.id,
                targetCode: t.targetCode,
                projectName: t.projectName ?? null,
                currentStage: t.currentStage ?? null,
                priorityTier: t.priorityTier,
                priorityScore: t.priorityScore,
                sector: (t as { sector?: string | null }).sector ?? null,
                country: (t as { country?: string | null }).country ?? null,
                dealOwner: (t as { dealOwner?: string | null }).dealOwner ?? null,
                dealType: (t as { dealType?: string | null }).dealType ?? null,
                needsAttention: (t as { needsAttention?: boolean | null }).needsAttention ?? null,
                openActionCount: (t as { openActionCount?: number | null }).openActionCount ?? null,
                overdueActionCount: (t as { overdueActionCount?: number | null }).overdueActionCount ?? null,
                lastInteractionDate: (t as { lastInteractionDate?: string | null }).lastInteractionDate ?? null,
                daysInCurrentStage: (t as { daysInCurrentStage?: number | null }).daysInCurrentStage ?? null,
                diligencePct: (t as { diligencePct?: number | null }).diligencePct ?? null,
                healthScore: (t as { healthScore?: string | null }).healthScore as "healthy" | "watch" | "at_risk" | null ?? null,
              }))}
              aiMode={aiMode}
            />
          )}
        </div>
      )}

      {(() => {
        const p = new URLSearchParams();
        if (stage !== "all")    p.set("stage", stage);
        if (tier !== "all")     p.set("priorityTier", tier);
        if (owner !== "all")    p.set("owner", owner);
        if (country !== "all")  p.set("country", country);
        if (dealType !== "all") p.set("dealType", dealType);
        return (
          <ExportDialog
            open={exportDialogOpen}
            onOpenChange={setExportDialogOpen}
            filterParams={p}
          />
        );
      })()}
    </div>
  );
}
