import React, { useState } from "react";
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
import { Search, Plus, ChevronRight, AlertTriangle, Calendar, Zap, User, MapPin, Upload } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { StageChip } from "@/components/stage-chip";

const STAGES = [
  "Sourcing", "Outreach", "Introductory Discussion", "NDA / CIM",
  "Preliminary Due Diligence", "Management Meeting", "Non-Binding Offer",
  "Confirmatory Due Diligence", "Binding Offer", "SPA Negotiation",
  "Integration Planning", "On Hold",
];

const TIERS = ["Must-Win", "Priority 1", "Priority 2", "Watchlist", "On Hold", "Dropped"];

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

export default function Pipeline() {
  const [, navigate] = useLocation();
  const [search, setSearch]               = useState("");
  const [stage, setStage]                 = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("stage");
    return s && s.trim().length > 0 ? s.trim() : "all";
  });
  const [tier, setTier]                   = useState("all");
  const [owner, setOwner]                 = useState("all");
  const [country, setCountry]             = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);

  const { data: filterOptions } = useGetTargetFilterOptions({
    query: { queryKey: getGetTargetFilterOptionsQueryKey() },
  });

  const { data: targets, isLoading } = useListTargets(
    {
      search:         search || undefined,
      stage:          stage !== "all" ? stage : undefined,
      priorityTier:   tier !== "all" ? tier : undefined,
      owner:          owner !== "all" ? owner : undefined,
      country:        country !== "all" ? country : undefined,
      needsAttention: attentionOnly ? true : undefined,
      isActive:       stage !== "Closed" && stage !== "Dropped" ? true : undefined,
    },
    {
      query: {
        queryKey: getListTargetsQueryKey({ search, stage, priorityTier: tier, owner, country, needsAttention: attentionOnly }),
      },
    },
  );

  const hasActiveFilters = search || stage !== "all" || tier !== "all" || owner !== "all" || country !== "all" || attentionOnly;

  function clearFilters() {
    setSearch(""); setStage("all"); setTier("all"); setOwner("all"); setCountry("all"); setAttentionOnly(false);
  }

  return (
    <div className="animate-in fade-in duration-500 pb-20 md:pb-8">

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

      <div className="p-4 md:p-6 space-y-2.5">

        {/* Target list */}
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
          <div className="space-y-2">
            {targets?.map((target) => {
              const isNeedsAttention = (target as { needsAttention?: boolean | null }).needsAttention;
              const openCount    = (target as { openActionCount?: number | null }).openActionCount ?? 0;
              const overdueCount = (target as { overdueActionCount?: number | null }).overdueActionCount ?? 0;
              const lastInteraction = (target as { lastInteractionDate?: string | null }).lastInteractionDate;
              const tierCardClass = getTierCardClass(target.priorityTier);

              return (
                <Link key={target.id} href={`/targets/${target.id}`}>
                  <Card className={`bg-card border-border/70 rounded-xl hover:shadow-md transition-all duration-150 cursor-pointer group ${tierCardClass}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Title row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm leading-snug truncate group-hover:text-primary transition-colors">
                                {target.projectName}
                              </div>
                              <div className="text-[10px] font-mono text-muted-foreground/60 uppercase mt-0.5 tracking-wider">
                                {target.targetCode}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isNeedsAttention && (
                                <Badge className="font-mono text-[9px] uppercase rounded-md bg-destructive text-destructive-foreground border-0">
                                  <AlertTriangle size={8} className="mr-1" /> Attn
                                </Badge>
                              )}
                              <Badge className={`font-mono text-[10px] uppercase rounded-md ${getTierBadgeColor(target.priorityTier)}`}>
                                {target.priorityTier}
                              </Badge>
                            </div>
                          </div>

                          {/* Stage + Score row */}
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <StageChip stage={target.currentStage ?? ""} size="xs" />
                            <Badge variant="outline" className="font-mono text-[10px] rounded-md border-border/60 text-muted-foreground">
                              <Zap size={9} className="mr-1 text-primary/60" />{Math.round(target.priorityScore)}
                            </Badge>
                            {target.sector && (
                              <span className="text-[10px] font-mono text-muted-foreground/70 uppercase">{target.sector}</span>
                            )}
                            {target.country && (
                              <span className="text-[10px] font-mono text-muted-foreground/70 flex items-center gap-1">
                                <MapPin size={9} />{target.country}
                              </span>
                            )}
                            {target.dealOwner && (
                              <span className="text-[10px] font-mono text-muted-foreground/70 flex items-center gap-1">
                                <User size={9} />{target.dealOwner}
                              </span>
                            )}
                          </div>

                          {/* Action counts */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {openCount > 0 ? (
                              <span className={`text-[10px] font-mono font-medium ${overdueCount > 0 ? "text-destructive" : "text-amber-500"}`}>
                                {openCount} open action{openCount !== 1 ? "s" : ""}{overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-muted-foreground/50">No open actions</span>
                            )}
                            {lastInteraction && (
                              <span className="text-[10px] font-mono text-muted-foreground/60 flex items-center gap-1">
                                <Calendar size={9} />
                                Last contact {format(parseISO(lastInteraction), "MMM d, yyyy")}
                              </span>
                            )}
                          </div>
                        </div>

                        <ChevronRight size={15} className="text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
