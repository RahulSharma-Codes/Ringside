import React, { useState } from "react";
import { Link } from "wouter";
import { useListTargets, getListTargetsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Plus, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const STAGES = [
  "Sourcing", "Outreach", "Introductory Discussion", "NDA / CIM", 
  "Preliminary Due Diligence", "Management Meeting", "Non-Binding Offer", 
  "Confirmatory Due Diligence", "Binding Offer", "SPA Negotiation", 
  "Integration Planning", "Closed", "On Hold", "Dropped"
];

const TIERS = ["Must-Win", "Priority 1", "Priority 2", "Watchlist", "On Hold", "Dropped"];

export default function Pipeline() {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [tier, setTier] = useState<string>("all");

  const { data: targets, isLoading } = useListTargets({
    search: search || undefined,
    stage: stage !== "all" ? stage : undefined,
    priorityTier: tier !== "all" ? tier : undefined,
    isActive: stage !== "Closed" && stage !== "Dropped" ? true : undefined
  }, {
    query: {
      queryKey: getListTargetsQueryKey({ search, stage, priorityTier: tier })
    }
  });

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "Must-Win": return "bg-destructive text-destructive-foreground hover:bg-destructive/90";
      case "Priority 1": return "bg-amber-500 text-white hover:bg-amber-500/90";
      case "Priority 2": return "bg-primary text-primary-foreground hover:bg-primary/90";
      case "Watchlist": return "bg-muted text-muted-foreground hover:bg-muted/90 border-border";
      default: return "bg-secondary text-secondary-foreground hover:bg-secondary/90";
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 h-full flex flex-col animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Pipeline</h1>
          <p className="text-sm text-muted-foreground">Active acquisition targets and evaluations</p>
        </div>
        <Link href="/targets/new">
          <Button size="sm" className="rounded-sm font-mono uppercase tracking-wider text-[10px] gap-2">
            <Plus size={14} /> New Target
          </Button>
        </Link>
      </div>

      <Card className="bg-card/50 backdrop-blur border-border rounded-sm shrink-0">
        <CardContent className="p-4 flex flex-col lg:flex-row gap-4 items-end lg:items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by code, project, or legal name..." 
              className="pl-9 rounded-sm font-mono text-sm bg-background/50 border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-full lg:w-[200px] rounded-sm font-mono text-[11px] uppercase border-border bg-background/50">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent className="rounded-sm font-mono text-[11px] uppercase">
                <SelectItem value="all">All Stages</SelectItem>
                {STAGES.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="w-full lg:w-[160px] rounded-sm font-mono text-[11px] uppercase border-border bg-background/50">
                <SelectValue placeholder="Priority Tier" />
              </SelectTrigger>
              <SelectContent className="rounded-sm font-mono text-[11px] uppercase">
                <SelectItem value="all">All Tiers</SelectItem>
                {TIERS.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 border border-border rounded-sm bg-card/50 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Target</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Stage</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Tier</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sector</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Owner</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground text-right">Score</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><Skeleton className="h-8 w-[150px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[40px] ml-auto" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : targets?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
                    No targets found matching criteria
                  </TableCell>
                </TableRow>
              ) : (
                targets?.map((target) => (
                  <TableRow key={target.id} className="border-border hover:bg-muted/30 group transition-colors">
                    <TableCell>
                      <div className="font-medium text-sm text-foreground">{target.projectName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">{target.targetCode}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-sm border-border bg-background/50">
                        {target.currentStage}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`font-mono text-[10px] uppercase rounded-sm border-0 ${getTierColor(target.priorityTier)}`}>
                        {target.priorityTier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                      {target.sector || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {target.dealOwner || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono font-bold text-primary">{Math.round(target.priorityScore)}</span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/targets/${target.id}`}>
                        <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight size={16} />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
