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
import { Search, Filter, Plus, ChevronRight, AlertTriangle, Calendar, Zap, User, MapPin, Upload } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";

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
  const [stage, setStage]                 = useState("all");
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

      {/* Executive header */}
      <div className="page-hero px-4 md:px-8 pt-6 md:pt-7 pb-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
          <div>
            <p className="metadata-label mb-1.5 text-primary/80">Deal Pipeline</p>
            <h1 className="text-2xl font-bold font-mono tracking-tight">Acquisition Targets</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Active opportunities and evaluations
              {targets && (
                <span className="ml-2 font-mono text-muted-foreground/60">· {targets.length} result{targets.length !== 1 ? "s" : ""}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg font-mono uppercase tracking-wider text-[10px] gap-2 border-border/70"
              onClick={() => navigate("/import")}
            >
              <Upload size={13} /> Import
            </Button>
            <Link href="/targets/new">
              <Button size="sm" className="rounded-lg font-mono uppercase tracking-wider text-[10px] gap-2">
                <Plus size={14} /> New Target
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-5">
        {/* Filter command bar */}
        <div className="command-bar p-3.5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search project, code, sector, country…"
              className="pl-9 rounded-lg font-mono text-sm bg-background/60 border-border/60 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-full sm:w-[185px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-8">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent className="font-mono text-[11px] uppercase">
                <SelectItem value="all">All Stages</SelectItem>
                {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="w-full sm:w-[145px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-8">
                <SelectValue placeholder="Priority Tier" />
              </SelectTrigger>
              <SelectContent className="font-mono text-[11px] uppercase">
                <SelectItem value="all">All Tiers</SelectItem>
                {TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            {(filterOptions?.owners?.length ?? 0) > 0 && (
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger className="w-full sm:w-[145px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-8">
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
                <SelectTrigger className="w-full sm:w-[145px] rounded-lg font-mono text-[11px] uppercase border-border/60 bg-background/60 h-8">
                  <SelectValue placeholder="Country" />
                </SelectTrigger>
                <SelectContent className="font-mono text-[11px] uppercase">
                  <SelectItem value="all">All Countries</SelectItem>
                  {filterOptions!.countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={attentionOnly ? "default" : "outline"}
              className={`h-7 rounded-lg font-mono text-[10px] uppercase tracking-wider gap-1.5 ${
                attentionOnly
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-0"
                  : "border-border/60 text-muted-foreground"
              }`}
              onClick={() => setAttentionOnly(!attentionOnly)}
            >
              <AlertTriangle size={10} /> Needs Attention
            </Button>

            {hasActiveFilters && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-lg font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                onClick={clearFilters}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Target list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-[130px] w-full rounded-xl" />)}
          </div>
        ) : targets?.length === 0 ? (
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
          <div className="space-y-2.5">
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
                            <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-md border-border/60 bg-background/40 text-muted-foreground">
                              {target.currentStage}
                            </Badge>
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
