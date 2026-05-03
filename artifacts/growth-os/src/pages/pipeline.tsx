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

function getTierColor(tier: string) {
  switch (tier) {
    case "Must-Win":  return "bg-destructive text-destructive-foreground border-0";
    case "Priority 1": return "bg-amber-500 text-white border-0";
    case "Priority 2": return "bg-primary text-primary-foreground border-0";
    case "Watchlist":  return "bg-muted text-muted-foreground border-border";
    default:           return "bg-secondary text-secondary-foreground border-0";
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
    <div className="p-4 md:p-8 space-y-5 animate-in fade-in duration-500 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight uppercase">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Active acquisition targets and evaluations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg font-mono uppercase tracking-wider text-[10px] gap-2"
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

      {/* Filter command bar */}
      <div className="command-bar p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search project, code, sector, country…"
            className="pl-9 rounded-lg font-mono text-sm bg-background/50 border-border/70"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="w-full sm:w-[190px] rounded-lg font-mono text-[11px] uppercase border-border/70 bg-background/50">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent className="font-mono text-[11px] uppercase">
              <SelectItem value="all">All Stages</SelectItem>
              {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger className="w-full sm:w-[150px] rounded-lg font-mono text-[11px] uppercase border-border/70 bg-background/50">
              <SelectValue placeholder="Priority Tier" />
            </SelectTrigger>
            <SelectContent className="font-mono text-[11px] uppercase">
              <SelectItem value="all">All Tiers</SelectItem>
              {TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          {(filterOptions?.owners?.length ?? 0) > 0 && (
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="w-full sm:w-[150px] rounded-lg font-mono text-[11px] uppercase border-border/70 bg-background/50">
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
              <SelectTrigger className="w-full sm:w-[150px] rounded-lg font-mono text-[11px] uppercase border-border/70 bg-background/50">
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
                : "border-border/70 text-muted-foreground"
            }`}
            onClick={() => setAttentionOnly(!attentionOnly)}
          >
            <AlertTriangle size={11} /> Needs Attention
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

          {targets && (
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">
              {targets.length} result{targets.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Target list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-[120px] w-full rounded-xl" />)}
        </div>
      ) : targets?.length === 0 ? (
        <Card className="bg-card border-border rounded-xl">
          <CardContent className="p-10 text-center">
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
        <div className="space-y-3">
          {targets?.map((target) => {
            const isNeedsAttention = (target as { needsAttention?: boolean | null }).needsAttention;
            const openCount    = (target as { openActionCount?: number | null }).openActionCount ?? 0;
            const overdueCount = (target as { overdueActionCount?: number | null }).overdueActionCount ?? 0;
            const lastInteraction = (target as { lastInteractionDate?: string | null }).lastInteractionDate;

            return (
              <Link key={target.id} href={`/targets/${target.id}`}>
                <Card className={`bg-card border-border rounded-xl hover:bg-muted/20 transition-colors cursor-pointer ${
                  isNeedsAttention ? "border-l-2 border-l-destructive" : ""
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Title row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm leading-snug truncate">{target.projectName}</div>
                            <div className="text-[10px] font-mono text-muted-foreground uppercase mt-0.5">
                              {target.targetCode}
                            </div>
                          </div>
                          {isNeedsAttention && (
                            <Badge className="shrink-0 font-mono text-[9px] uppercase rounded-md bg-destructive text-destructive-foreground border-0">
                              <AlertTriangle size={8} className="mr-1" /> Attention
                            </Badge>
                          )}
                        </div>

                        {/* Meta chips */}
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-md border-border/70 bg-background/40">
                            {target.currentStage}
                          </Badge>
                          <Badge className={`font-mono text-[10px] uppercase rounded-md ${getTierColor(target.priorityTier)}`}>
                            {target.priorityTier}
                          </Badge>
                          <Badge variant="outline" className="font-mono text-[10px] rounded-md border-border/70 text-muted-foreground">
                            <Zap size={9} className="mr-1" />{Math.round(target.priorityScore)}
                          </Badge>
                        </div>

                        {/* Detail row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {target.sector && (
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{target.sector}</span>
                          )}
                          {target.country && (
                            <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                              <MapPin size={9} />{target.country}
                            </span>
                          )}
                          {target.dealOwner && (
                            <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                              <User size={9} />{target.dealOwner}
                            </span>
                          )}
                        </div>

                        {/* Action counts */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {openCount > 0 ? (
                            <span className={`text-[10px] font-mono ${overdueCount > 0 ? "text-destructive" : "text-amber-500"}`}>
                              {openCount} open {overdueCount > 0 ? `(${overdueCount} overdue)` : "action" + (openCount !== 1 ? "s" : "")}
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-muted-foreground">No open actions</span>
                          )}
                          {lastInteraction && (
                            <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                              <Calendar size={9} />
                              Last contact {format(parseISO(lastInteraction), "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
