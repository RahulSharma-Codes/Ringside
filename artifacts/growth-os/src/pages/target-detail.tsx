import React, { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import {
  useGetTarget, getGetTargetQueryKey,
  useDeleteTarget,
  useGetStageHistory, getGetStageHistoryQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Target as TargetIcon, Plus, ShieldAlert, Edit, Trash2,
  MessageSquare, ListChecks, GitBranch,
  LayoutGrid, ClipboardCheck, FolderOpen, Sparkles, Loader2, Copy, Check, Bot,
  Activity as ActivityIcon, Scale, TrendingUp, AlertTriangle, Users,
  ShieldCheck, ClipboardList, Printer,
} from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button as Btn } from "@/components/ui/button";
import { StageRail } from "@/components/stage-rail";
import { StageChip } from "@/components/stage-chip";
import { HealthDot } from "@/components/health-dot";
import { DiligenceTab } from "@/pages/target-detail-diligence";
import { DocumentsTab } from "@/pages/target-detail-documents";
import { ValuationTab } from "@/pages/target-detail-valuation";
import { SynergiesTab } from "@/pages/target-detail-synergies";
import { StakeholdersTab } from "@/pages/target-detail-stakeholders";
import { ComplianceTab } from "@/pages/target-detail-compliance";
import { AuditTrailTab } from "@/components/audit-trail-tab";
import { IcTab } from "@/pages/target-detail-ic";
import { OverviewTab } from "@/pages/target-detail-overview";
import { InteractionsTab } from "@/pages/target-detail-interactions";
import { ActionsTab } from "@/pages/target-detail-actions";
import { HistoryTab } from "@/pages/target-detail-history";
import { ActivityTab } from "@/pages/target-detail-activity";
import { StageChangeDialog } from "@/pages/target-detail-stage-dialog";
import { EditTargetDialog } from "@/pages/target-detail-edit-dialog";

export default function TargetDetail() {
  const { id } = useParams();
  const targetId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canEditDeal } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const [stageOpen, setStageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [interactionAddOpen, setInteractionAddOpen] = useState(false);
  const [actionAddOpen, setActionAddOpen] = useState(false);

  const [aiBriefOpen, setAiBriefOpen] = useState(false);
  const [briefContent, setBriefContent] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefSetupRequired, setBriefSetupRequired] = useState(false);
  const [briefBillingRequired, setBriefBillingRequired] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);

  const { data: target, isLoading: loadingTarget } = useGetTarget(targetId, {
    query: { enabled: !!targetId, queryKey: getGetTargetQueryKey(targetId) },
  });
  const { data: history } = useGetStageHistory(targetId, {
    query: { enabled: !!targetId, queryKey: getGetStageHistoryQueryKey(targetId) },
  });

  const deleteTarget = useDeleteTarget();

  const invalidateTarget = () => queryClient.invalidateQueries({ queryKey: getGetTargetQueryKey(targetId) });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ai") === "opportunity-brief" && !isNaN(targetId)) {
      handleGenerateBrief();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateBrief = async () => {
    setBriefLoading(true);
    setBriefContent(null);
    setBriefSetupRequired(false);
    setBriefBillingRequired(false);
    setAiBriefOpen(true);
    try {
      const resp = await customFetch<{
        brief: string | null; setupRequired?: boolean; billingRequired?: boolean; error?: string;
      }>("/api/ai/opportunity-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      if (resp.setupRequired) { setBriefSetupRequired(true); return; }
      if (resp.billingRequired) { setBriefBillingRequired(true); return; }
      setBriefContent(resp.brief ?? "No brief generated.");
    } catch {
      setBriefContent("Failed to generate brief. Please try again.");
    } finally {
      setBriefLoading(false);
    }
  };

  const handleDeleteTarget = () => {
    deleteTarget.mutate(
      { id: targetId },
      {
        onSuccess: () => { toast({ title: "Target Archived" }); setLocation("/pipeline"); },
        onError: () => toast({ title: "Error", description: "Could not archive target", variant: "destructive" }),
      },
    );
  };

  if (loadingTarget || !target) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-[200px]" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  const daysInCurrentStage = (() => {
    if (!history || history.length === 0) return undefined;
    const latestEntry = history[0];
    if (!latestEntry.changedAt) return undefined;
    try { return differenceInDays(new Date(), parseISO(latestEntry.changedAt)); }
    catch { return undefined; }
  })();

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">

      {/* Header — Row 1: nav + name + action buttons */}
      <div className="border-b border-border/60 bg-background/80 backdrop-blur-sm shrink-0">
        <div className="max-w-6xl mx-auto px-4 md:px-5 pt-4 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/pipeline">
                <Button variant="ghost" size="icon" className="rounded-lg h-8 w-8 text-muted-foreground hover:text-foreground shrink-0">
                  <ArrowLeft size={16} />
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight truncate leading-tight">
                  {target.projectName}
                </h1>
                <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider mt-0.5">
                  {target.targetCode}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline"
                className="rounded-lg font-mono text-[10px] uppercase shrink-0 border-border/60 h-8 gap-1.5 hidden sm:flex"
                onClick={() => window.open(`/targets/${targetId}/ic-brief`, "_blank")}
              >
                <Printer size={11} className="text-muted-foreground" />
                IC Brief
              </Button>
              <Button size="sm" variant="outline"
                className="rounded-lg font-mono text-[10px] uppercase shrink-0 border-border/60 h-8 gap-1.5 hidden sm:flex"
                onClick={handleGenerateBrief} disabled={briefLoading}
              >
                {briefLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} className="text-primary" />}
                AI Brief
              </Button>
              {canEditDeal && (
                <Button size="sm" variant="outline" className="rounded-lg font-mono text-[10px] uppercase shrink-0 border-border/60 h-8 gap-1.5" onClick={() => setEditOpen(true)}>
                  <Edit size={11} />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
              {canEditDeal && (
                <Button size="sm" className="rounded-lg font-mono uppercase text-[10px] gap-1.5 tracking-wider h-8" onClick={() => setStageOpen(true)}>
                  <TargetIcon size={12} /> Stage
                </Button>
              )}
            </div>
          </div>

          {/* Row 2: stat strip — mobile shows Stage | Health | Days only; full details on sm+ */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-border/30">
            {target.currentStage && (
              <StageChip stage={target.currentStage} size="xs" />
            )}
            {(target as { healthScore?: string | null }).healthScore && (
              <HealthDot
                score={(target as { healthScore?: string | null }).healthScore as "healthy" | "watch" | "at_risk"}
                showLabel
                size="sm"
              />
            )}
            {daysInCurrentStage !== undefined && (
              <span className="text-[10px] font-mono text-muted-foreground/70 flex items-center gap-1">
                <TrendingUp size={9} className="text-muted-foreground/50" />{daysInCurrentStage}d
              </span>
            )}
            {target.priorityTier && (
              <span className={`hidden sm:inline text-[10px] font-mono font-semibold ${
                target.priorityTier === "Must-Win"   ? "text-destructive" :
                target.priorityTier === "Priority 1" ? "text-amber-500" : "text-primary"
              }`}>
                {target.priorityTier}
              </span>
            )}
            {target.sector && (
              <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground uppercase">{target.sector}</span>
            )}
            {target.country && (
              <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground">{target.country}</span>
            )}
            {(target as { diligencePct?: number | null }).diligencePct != null && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/70">
                <ClipboardList size={9} className="text-muted-foreground/50" />
                <span>{(target as { diligencePct?: number | null }).diligencePct}%</span>
                <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{ width: `${(target as { diligencePct?: number | null }).diligencePct}%` }}
                  />
                </div>
              </span>
            )}
            {target.lastInteractionDate && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60">
                <MessageSquare size={9} className="text-muted-foreground/40" />
                Last contact {format(parseISO(target.lastInteractionDate), "MMM d, yyyy")}
              </span>
            )}
            {target.isConfidential && (
              <Badge variant="outline" className="hidden sm:inline-flex font-mono text-[9px] uppercase bg-amber-500/10 text-amber-500 border-amber-500/25 h-4 px-1.5">
                <ShieldAlert size={8} className="mr-1" />Confidential
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Stage Progression Rail */}
      <div className="border-b border-border/40 bg-background/60 px-4 md:px-5 py-3 shrink-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50">Pipeline Stage</span>
            {daysInCurrentStage !== undefined && (
              <span className="text-[9px] font-mono text-muted-foreground/40">· {daysInCurrentStage}d in current stage</span>
            )}
          </div>
          <StageRail mode="progression" currentStage={target.currentStage ?? "Sourcing"} daysInStage={daysInCurrentStage} dealType={target.dealType} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto bg-background pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none p-0 h-auto mb-6">
              {[
                { value: "overview",      label: "Overview",     icon: <LayoutGrid size={13} /> },
                { value: "interactions",  label: "Log",          icon: <MessageSquare size={13} /> },
                { value: "actions",       label: "Actions",      icon: <ListChecks size={13} /> },
                { value: "history",       label: "Timeline",     icon: <GitBranch size={13} /> },
                { value: "diligence",     label: "Diligence",    icon: <ClipboardCheck size={13} /> },
                { value: "documents",     label: "Documents",    icon: <FolderOpen size={13} /> },
                { value: "valuation",     label: "Valuation",    icon: <TrendingUp size={13} /> },
                { value: "synergies",     label: "Synergies",    icon: <Sparkles size={13} /> },
                { value: "activity",      label: "Activity",     icon: <ActivityIcon size={13} /> },
                { value: "ic",            label: "IC",           icon: <Scale size={13} /> },
                { value: "stakeholders",  label: "Stakeholders", icon: <Users size={13} /> },
                { value: "compliance",    label: "Compliance",   icon: <ShieldCheck size={13} /> },
                { value: "audit",         label: "Audit",        icon: <ClipboardList size={13} /> },
              ].map(({ value, label, icon }) => (
                <TabsTrigger key={value} value={value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 md:px-4 py-2 font-mono text-[11px] uppercase tracking-wider flex items-center gap-1.5"
                >
                  {icon}{label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-0">
              <OverviewTab targetId={targetId} target={target} />
            </TabsContent>
            <TabsContent value="interactions" className="space-y-4 mt-0">
              <InteractionsTab targetId={targetId} addOpen={interactionAddOpen} onAddOpenChange={setInteractionAddOpen} />
            </TabsContent>
            <TabsContent value="actions" className="space-y-4 mt-0">
              <ActionsTab targetId={targetId} addOpen={actionAddOpen} onAddOpenChange={setActionAddOpen} />
            </TabsContent>
            <TabsContent value="history" className="mt-0"><HistoryTab targetId={targetId} /></TabsContent>
            <TabsContent value="ic" className="mt-0"><IcTab targetId={targetId} dealName={target.projectName ?? target.targetCode ?? undefined} /></TabsContent>
            <TabsContent value="stakeholders" className="mt-0"><StakeholdersTab targetId={targetId} /></TabsContent>
            <TabsContent value="compliance" className="mt-0"><ComplianceTab targetId={targetId} /></TabsContent>
            <TabsContent value="audit" className="mt-0"><AuditTrailTab targetId={targetId} /></TabsContent>
            <TabsContent value="diligence" className="space-y-4 mt-0"><DiligenceTab targetId={targetId} /></TabsContent>
            <TabsContent value="documents" className="space-y-4 mt-0"><DocumentsTab targetId={targetId} /></TabsContent>
            <TabsContent value="valuation" className="mt-0">
              <ValuationTab targetId={targetId} currentStage={target.currentStage ?? undefined} />
            </TabsContent>
            <TabsContent value="synergies" className="mt-0">
              <SynergiesTab targetId={targetId} currentStage={target.currentStage ?? "Sourcing"} />
            </TabsContent>
            <TabsContent value="activity" className="mt-0">
              <ActivityTab targetId={targetId} isActive={activeTab === "activity"} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar/95 backdrop-blur-sm p-3 flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase border-border"
          onClick={() => { setActiveTab("interactions"); setInteractionAddOpen(true); }}>
          <MessageSquare size={13} className="mr-1" /> Log
        </Button>
        <Button variant="outline" size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase border-border"
          onClick={() => { setActiveTab("actions"); setActionAddOpen(true); }}>
          <Plus size={13} className="mr-1" /> Add Action
        </Button>
        {canEditDeal && (
          <Button size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase" onClick={() => setStageOpen(true)}>
            <TargetIcon size={13} className="mr-1" /> Change Stage
          </Button>
        )}
      </div>

      {/* ══ DIALOGS ══ */}

      <StageChangeDialog
        open={stageOpen}
        onOpenChange={setStageOpen}
        targetId={targetId}
        target={target}
        onSuccess={invalidateTarget}
      />

      <EditTargetDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        targetId={targetId}
        target={target}
        onSuccess={invalidateTarget}
      />

      {/* Delete/Archive Target */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[425px] border-destructive bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg text-destructive">Archive Target</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will archive <span className="font-medium text-foreground">{target.projectName}</span> and remove it from the active pipeline.
            </p>
          </div>
          <DialogFooter>
            <Btn variant="outline" onClick={() => setDeleteOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Btn>
            <Btn variant="destructive" onClick={handleDeleteTarget} disabled={deleteTarget.isPending} className="rounded-sm font-mono uppercase text-[10px]">Archive</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Opportunity Brief */}
      <Dialog open={aiBriefOpen} onOpenChange={(open) => { setAiBriefOpen(open); if (!open) setBriefContent(null); }}>
        <DialogContent className="sm:max-w-[680px] border-border bg-sidebar rounded-sm max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Bot size={13} className="text-primary" />
              </div>
              <DialogTitle className="font-mono uppercase tracking-tight text-base">AI Opportunity Brief</DialogTitle>
              {briefContent && (
                <span className="text-[10px] font-mono text-muted-foreground/60 bg-muted/60 border border-border/50 px-2 py-0.5 rounded-md ml-auto">
                  {target.projectName}
                </span>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 min-h-0">
            {briefLoading && (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Loader2 size={18} className="text-primary animate-spin" />
                </div>
                <p className="text-sm text-muted-foreground">Generating AI brief…</p>
              </div>
            )}
            {!briefLoading && briefSetupRequired && (
              <div className="text-center py-10 space-y-2">
                <p className="text-sm font-semibold">AI Not Configured</p>
                <p className="text-sm text-muted-foreground">Add an OPENAI_API_KEY secret to enable AI briefs.</p>
              </div>
            )}
            {!briefLoading && briefBillingRequired && (
              <div className="text-center py-10 space-y-2">
                <Sparkles size={24} className="text-amber-500 mx-auto" />
                <p className="text-sm font-semibold text-amber-500">AI Credits Needed</p>
                <p className="text-sm text-muted-foreground">Add OpenAI API credits to activate AI workflows.</p>
              </div>
            )}
            {!briefLoading && briefContent && !briefSetupRequired && !briefBillingRequired && (
              <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground/90">{briefContent}</div>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t border-border/60 pt-3 mt-0">
            {briefContent && !briefSetupRequired && !briefBillingRequired && (
              <Btn variant="outline" size="sm"
                onClick={() => { navigator.clipboard.writeText(briefContent ?? "").catch(() => {}); setBriefCopied(true); setTimeout(() => setBriefCopied(false), 2000); }}
                className="rounded-sm font-mono text-[10px] uppercase gap-1"
              >
                {briefCopied ? <Check size={11} /> : <Copy size={11} />}
                {briefCopied ? "Copied" : "Copy Brief"}
              </Btn>
            )}
            <Btn variant="outline" size="sm" onClick={handleGenerateBrief} disabled={briefLoading} className="rounded-sm font-mono text-[10px] uppercase gap-1">
              <Sparkles size={11} /> Regenerate
            </Btn>
            <Btn size="sm" onClick={() => setAiBriefOpen(false)} className="rounded-sm font-mono text-[10px] uppercase">Close</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
