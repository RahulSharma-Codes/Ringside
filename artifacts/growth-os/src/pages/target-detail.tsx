import React, { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import {
  useGetTarget, getGetTargetQueryKey,
  useUpdateTargetStage,
  useDeleteTarget,
  useUpdateTarget,
  useGetStageHistory, getGetStageHistoryQueryKey,
  useGetStageGate,
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
  CheckCircle2, MessageSquare, ListChecks, GitBranch,
  LayoutGrid, ClipboardCheck, FolderOpen, Sparkles, Loader2, Copy, Check, Bot,
  Activity as ActivityIcon, Scale, TrendingUp, AlertTriangle, Users,
  ShieldCheck, ClipboardList,
} from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  StageRail, PIPELINE_STAGE_ORDER, OFF_TRACK_STAGES, isDealTypeChangeSafe,
} from "@/components/stage-rail";
import { StageChip } from "@/components/stage-chip";
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

const PRIORITY_TIERS = ["Must-Win", "Priority 1", "Priority 2", "Watchlist"];
const DEAL_TYPES = [
  "Acquisition", "Minority Investment", "Divestiture", "JV",
  "Partnership", "Strategic Alliance", "Other",
];

type EditTargetData = {
  projectName: string;
  priorityTier: string;
  dealType: string;
  strategicRationale: string;
  sector: string;
  subsector: string;
  geographyRegion: string;
  country: string;
  dealOwner: string;
  dealChampion: string;
  executiveSponsor: string;
  strategicFitScore: number;
  synergyScore: number;
  financialAttractivenessScore: number;
  processMaturityScore: number;
  riskPenaltyScore: number;
};

export default function TargetDetail() {
  const { id } = useParams();
  const targetId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canEditDeal } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  // Stage change state
  const [stageOpen, setStageOpen] = useState(false);
  const [stageVal, setStageVal] = useState("");
  const [stageReason, setStageReason] = useState("");
  const [closeReasonCode, setCloseReasonCode] = useState("");
  const [phase1VerdictAccuracy, setPhase1VerdictAccuracy] = useState("");
  const [phase1VerdictNote, setPhase1VerdictNote] = useState("");
  const [closeMissTheme, setCloseMissTheme] = useState("");

  const CLOSURE_VERDICT_STAGES = new Set(["Closed", "Dropped"]);
  const isClosureStage = CLOSURE_VERDICT_STAGES.has(stageVal);

  // Edit target state
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<EditTargetData>({
    projectName: "", priorityTier: "", dealType: "", strategicRationale: "",
    sector: "", subsector: "", geographyRegion: "", country: "",
    dealOwner: "", dealChampion: "", executiveSponsor: "",
    strategicFitScore: 50, synergyScore: 50, financialAttractivenessScore: 50,
    processMaturityScore: 50, riskPenaltyScore: 0,
  });
  const [dealTypeWarning, setDealTypeWarning] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Mobile bar triggers for tab-managed dialogs
  const [interactionAddOpen, setInteractionAddOpen] = useState(false);
  const [actionAddOpen, setActionAddOpen] = useState(false);

  // AI brief state
  const [aiBriefOpen, setAiBriefOpen] = useState(false);
  const [briefContent, setBriefContent] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefSetupRequired, setBriefSetupRequired] = useState(false);
  const [briefBillingRequired, setBriefBillingRequired] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);

  // Queries
  const { data: target, isLoading: loadingTarget } = useGetTarget(targetId, {
    query: { enabled: !!targetId, queryKey: getGetTargetQueryKey(targetId) },
  });
  const { data: history } = useGetStageHistory(targetId, {
    query: { enabled: !!targetId, queryKey: getGetStageHistoryQueryKey(targetId) },
  });
  const { data: stageGateData, isFetching: loadingGate } = useGetStageGate(
    targetId,
    { newStage: stageVal },
    { query: { enabled: !!stageVal && stageOpen, queryKey: [`/api/targets/${targetId}/stage-gate`, { newStage: stageVal }] } },
  );

  // Mutations
  const updateStage = useUpdateTargetStage();
  const updateTarget = useUpdateTarget();
  const deleteTarget = useDeleteTarget();

  const invalidateTarget = () => queryClient.invalidateQueries({ queryKey: getGetTargetQueryKey(targetId) });
  const invalidateHistory = () => queryClient.invalidateQueries({ queryKey: getGetStageHistoryQueryKey(targetId) });

  useEffect(() => {
    if (target) {
      setEditData({
        projectName: target.projectName ?? "",
        priorityTier: target.priorityTier ?? "",
        dealType: target.dealType ?? "",
        strategicRationale: target.strategicRationale ?? "",
        sector: target.sector ?? "",
        subsector: target.subsector ?? "",
        geographyRegion: target.geographyRegion ?? "",
        country: target.country ?? "",
        dealOwner: target.dealOwner ?? "",
        dealChampion: target.dealChampion ?? "",
        executiveSponsor: target.executiveSponsor ?? "",
        strategicFitScore: target.strategicFitScore ?? 50,
        synergyScore: target.synergyScore ?? 50,
        financialAttractivenessScore: target.financialAttractivenessScore ?? 50,
        processMaturityScore: target.processMaturityScore ?? 50,
        riskPenaltyScore: target.riskPenaltyScore ?? 0,
      });
      setDealTypeWarning(null);
    }
  }, [target]);

  // Auto-open brief when navigated here with ?ai=opportunity-brief
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
        brief: string | null;
        setupRequired?: boolean;
        billingRequired?: boolean;
        error?: string;
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

  const verdictIncomplete =
    (isClosureStage && !phase1VerdictAccuracy) ||
    (stageVal === "Dropped" && !closeReasonCode) ||
    (["Partially-correct", "Wrong"].includes(phase1VerdictAccuracy) && !phase1VerdictNote.trim());

  const handleUpdateStage = () => {
    if (!stageVal || !stageReason.trim() || verdictIncomplete) return;
    updateStage.mutate(
      {
        id: targetId,
        data: {
          newStage: stageVal,
          changeReason: stageReason,
          ...(closeReasonCode && { closeReasonCode }),
          ...(phase1VerdictAccuracy && { phase1VerdictAccuracy }),
          ...(phase1VerdictNote.trim() && { phase1VerdictNote: phase1VerdictNote.trim() }),
          ...(closeMissTheme && { closeMissTheme }),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Stage Updated", description: `Moved to ${stageVal}` });
          setStageOpen(false); setStageVal(""); setStageReason("");
          setCloseReasonCode(""); setPhase1VerdictAccuracy(""); setPhase1VerdictNote(""); setCloseMissTheme("");
          invalidateTarget(); invalidateHistory();
        },
        onError: () => toast({ title: "Error", description: "Stage update failed", variant: "destructive" }),
      }
    );
  };

  const handleUpdateTarget = () => {
    updateTarget.mutate(
      {
        id: targetId,
        data: {
          projectName: editData.projectName || undefined,
          priorityTier: editData.priorityTier || undefined,
          dealType: editData.dealType || null,
          strategicRationale: editData.strategicRationale || undefined,
          sector: editData.sector || undefined,
          subsector: editData.subsector || undefined,
          geographyRegion: editData.geographyRegion || undefined,
          country: editData.country || undefined,
          dealOwner: editData.dealOwner || undefined,
          dealChampion: editData.dealChampion || undefined,
          executiveSponsor: editData.executiveSponsor || undefined,
          strategicFitScore: editData.strategicFitScore,
          synergyScore: editData.synergyScore,
          financialAttractivenessScore: editData.financialAttractivenessScore,
          processMaturityScore: editData.processMaturityScore,
          riskPenaltyScore: editData.riskPenaltyScore,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Target Updated" });
          setEditOpen(false); invalidateTarget();
        },
        onError: () => toast({ title: "Error", description: "Could not update target", variant: "destructive" }),
      }
    );
  };

  const handleDeleteTarget = () => {
    deleteTarget.mutate(
      { id: targetId },
      {
        onSuccess: () => {
          toast({ title: "Target Archived" });
          setLocation("/pipeline");
        },
        onError: () => toast({ title: "Error", description: "Could not archive target", variant: "destructive" }),
      }
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
    try {
      return differenceInDays(new Date(), parseISO(latestEntry.changedAt));
    } catch {
      return undefined;
    }
  })();

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">

      {/* Header */}
      <div className="border-b border-border/60 bg-background/80 backdrop-blur-sm p-4 md:p-5 shrink-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/pipeline">
                <Button variant="ghost" size="icon" className="rounded-lg h-8 w-8 text-muted-foreground hover:text-foreground shrink-0">
                  <ArrowLeft size={16} />
                </Button>
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight truncate">{target.projectName}</h1>
                  {target.isConfidential && (
                    <Badge variant="outline" className="font-mono text-[10px] uppercase bg-amber-500/10 text-amber-500 border-amber-500/25 shrink-0">
                      <ShieldAlert size={10} className="mr-1" /> Confidential
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-muted-foreground/70">{target.targetCode}</span>
                  <span className="w-1 h-1 bg-border rounded-full" />
                  <span>{target.sector || "Uncategorized"}</span>
                  <span className="w-1 h-1 bg-border rounded-full" />
                  <span className={`font-bold ${
                    target.priorityTier === "Must-Win"   ? "text-destructive" :
                    target.priorityTier === "Priority 1" ? "text-amber-500" :
                    "text-primary"
                  }`}>{target.priorityTier}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg font-mono text-[10px] uppercase shrink-0 border-border/60 h-8 gap-1.5 flex"
                onClick={handleGenerateBrief}
                disabled={briefLoading}
              >
                {briefLoading
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Sparkles size={11} className="text-primary" />}
                Generate AI Brief
              </Button>
              <Button size="icon" variant="outline" className="rounded-lg border-border/70 text-muted-foreground h-8 w-8" onClick={() => setEditOpen(true)}>
                <Edit size={13} />
              </Button>
              <Button size="icon" variant="outline" className="rounded-lg border-border/70 text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={13} />
              </Button>
              <div className="hidden md:flex items-center gap-3 border-l border-border/60 pl-3">
                <div className="text-right">
                  <div className="text-[9px] font-mono text-muted-foreground/70 uppercase tracking-wider">Stage</div>
                  <div className="font-semibold text-sm font-mono">{target.currentStage}</div>
                </div>
                {canEditDeal && (
                  <Button size="sm" className="rounded-lg font-mono uppercase text-[10px] gap-1.5 tracking-wider h-8" onClick={() => setStageOpen(true)}>
                    <TargetIcon size={12} /> Change Stage
                  </Button>
                )}
              </div>
            </div>
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
          <StageRail
            mode="progression"
            currentStage={target.currentStage ?? "Sourcing"}
            daysInStage={daysInCurrentStage}
            dealType={target.dealType}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto bg-background pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none p-0 h-auto mb-6">
              {[
                { value: "overview",      label: "Overview",      icon: <LayoutGrid size={13} /> },
                { value: "interactions",  label: "Log",           icon: <MessageSquare size={13} /> },
                { value: "actions",       label: "Actions",       icon: <ListChecks size={13} /> },
                { value: "history",       label: "Timeline",      icon: <GitBranch size={13} /> },
                { value: "diligence",     label: "Diligence",     icon: <ClipboardCheck size={13} /> },
                { value: "documents",     label: "Documents",     icon: <FolderOpen size={13} /> },
                { value: "valuation",     label: "Valuation",     icon: <TrendingUp size={13} /> },
                { value: "synergies",     label: "Synergies",     icon: <Sparkles size={13} /> },
                { value: "activity",      label: "Activity",      icon: <ActivityIcon size={13} /> },
                { value: "ic",            label: "IC",            icon: <Scale size={13} /> },
                { value: "stakeholders",  label: "Stakeholders",  icon: <Users size={13} /> },
                { value: "compliance",    label: "Compliance",    icon: <ShieldCheck size={13} /> },
                { value: "audit",         label: "Audit",         icon: <ClipboardList size={13} /> },
              ].map(({ value, label, icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
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
              <InteractionsTab
                targetId={targetId}
                addOpen={interactionAddOpen}
                onAddOpenChange={setInteractionAddOpen}
              />
            </TabsContent>

            <TabsContent value="actions" className="space-y-4 mt-0">
              <ActionsTab
                targetId={targetId}
                addOpen={actionAddOpen}
                onAddOpenChange={setActionAddOpen}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              <HistoryTab targetId={targetId} />
            </TabsContent>

            <TabsContent value="ic" className="mt-0">
              <IcTab targetId={targetId} />
            </TabsContent>

            <TabsContent value="stakeholders" className="mt-0">
              <StakeholdersTab targetId={targetId} />
            </TabsContent>

            <TabsContent value="compliance" className="mt-0">
              <ComplianceTab targetId={targetId} />
            </TabsContent>

            <TabsContent value="audit" className="mt-0">
              <AuditTrailTab targetId={targetId} />
            </TabsContent>

            <TabsContent value="diligence" className="space-y-4 mt-0">
              <DiligenceTab targetId={targetId} />
            </TabsContent>

            <TabsContent value="documents" className="space-y-4 mt-0">
              <DocumentsTab targetId={targetId} />
            </TabsContent>

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
        <Button variant="outline" size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase border-border" onClick={() => setInteractionAddOpen(true)}>
          <MessageSquare size={13} className="mr-1" /> Log
        </Button>
        <Button variant="outline" size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase border-border" onClick={() => setActionAddOpen(true)}>
          <Plus size={13} className="mr-1" /> Add Action
        </Button>
        {canEditDeal && (
          <Button size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase" onClick={() => setStageOpen(true)}>
            <TargetIcon size={13} className="mr-1" /> Change Stage
          </Button>
        )}
      </div>

      {/* ══ MODALS ══ */}

      {/* Change Stage */}
      <Dialog open={stageOpen} onOpenChange={setStageOpen}>
        <DialogContent className="sm:max-w-[600px] border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Change Pipeline Stage</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-5">
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Current Stage</div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/40 text-primary font-mono text-[11px] px-2.5 py-1 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  {target.currentStage}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Select New Stage <span className="text-destructive">*</span>
              </div>
              <StageRail
                mode="progression"
                currentStage={target.currentStage ?? "Sourcing"}
                dealType={target.dealType}
                onSelectStage={setStageVal}
                selectedStage={stageVal}
              />
              <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider shrink-0">Off-track</span>
                {OFF_TRACK_STAGES.filter((s) => s !== target.currentStage).map((s) => {
                  const isSelected = stageVal === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStageVal(s)}
                      className={`px-2 py-1 rounded-md border font-mono text-[9px] uppercase tracking-wide transition-all duration-150 ${
                        isSelected
                          ? s === "On Hold"
                            ? "bg-amber-500/20 border-amber-500 text-amber-500 font-semibold"
                            : "bg-destructive/20 border-destructive text-destructive font-semibold"
                          : "bg-background/50 border-border/50 text-muted-foreground/60 hover:border-border hover:text-muted-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stage Gate Advisory Checklist */}
            {stageVal && (
              <div className="space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Prerequisites for {stageVal}
                  {loadingGate && <Loader2 size={10} className="animate-spin text-muted-foreground/60" />}
                </div>
                {!loadingGate && stageGateData && stageGateData.gateItems.length > 0 && (
                  <div className="rounded-sm border border-border/60 bg-background/40 divide-y divide-border/40">
                    {stageGateData.gateItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2">
                        {item.status === "met" ? (
                          <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                        ) : item.status === "unmet" ? (
                          <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                        ) : (
                          <span className="text-[11px] text-muted-foreground/50 shrink-0 mt-0.5 font-mono">—</span>
                        )}
                        <div className="min-w-0">
                          <div className={`text-[11px] font-mono ${item.status === "met" ? "text-emerald-500/90" : item.status === "unmet" ? "text-amber-500/90" : "text-muted-foreground/50"}`}>
                            {item.label}
                          </div>
                          {item.detail && (
                            <div className="text-[10px] text-muted-foreground/60 mt-0.5">{item.detail}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!loadingGate && stageGateData && stageGateData.gateItems.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/50 font-mono italic">
                    These are advisory — you can proceed regardless.
                  </p>
                )}
                {!loadingGate && stageGateData && stageGateData.gateItems.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/50 font-mono italic">No prerequisite checks for this stage.</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {(stageVal === "Rejected" || stageVal === "On Hold")
                  ? <>Drop / Hold Reason <span className="text-destructive">*</span></>
                  : <>Rationale / Notes <span className="text-destructive">*</span></>
                }
              </label>
              <Textarea
                value={stageReason}
                onChange={(e) => setStageReason(e.target.value)}
                className="rounded-sm bg-background/50 resize-none h-20"
                placeholder={
                  stageVal === "Rejected"
                    ? "Required — state the primary reason this deal is being dropped"
                    : stageVal === "On Hold"
                    ? "Required — explain why the deal is being put on hold"
                    : "Required — explain the reason for this stage change"
                }
              />
              {stageVal && !stageReason.trim() && (
                <p className="text-[10px] text-destructive font-mono">A reason is required to change stage.</p>
              )}
            </div>

            {/* Deal Close Verdict */}
            {isClosureStage && (
              <div className="space-y-3 border border-amber-500/30 bg-amber-500/5 rounded-sm p-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-amber-600 font-semibold flex items-center gap-1.5">
                  <AlertTriangle size={11} />
                  Deal Close Verdict
                  <span className="text-muted-foreground/60 normal-case font-normal">— required to close the learning loop</span>
                </div>

                {stageVal === "Dropped" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Close Reason Code <span className="text-destructive">*</span>
                    </label>
                    <Select value={closeReasonCode} onValueChange={setCloseReasonCode}>
                      <SelectTrigger className="rounded-sm bg-background/50 text-sm h-9"><SelectValue placeholder="Select reason…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Price mismatch">Price mismatch</SelectItem>
                        <SelectItem value="Owner unwilling to sell">Owner unwilling to sell</SelectItem>
                        <SelectItem value="Competitive process lost">Competitive process lost</SelectItem>
                        <SelectItem value="Strategy change">Strategy change</SelectItem>
                        <SelectItem value="Regulatory block">Regulatory block</SelectItem>
                        <SelectItem value="Due diligence finding">Due diligence finding</SelectItem>
                        <SelectItem value="Target approach failed">Target approach failed</SelectItem>
                        <SelectItem value="Process abandoned">Process abandoned</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {!closeReasonCode && (
                      <p className="text-[10px] text-destructive font-mono">Close reason is required for Dropped deals.</p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Phase 1 AI Screen Accuracy <span className="text-destructive">*</span>
                  </label>
                  <Select value={phase1VerdictAccuracy} onValueChange={setPhase1VerdictAccuracy}>
                    <SelectTrigger className="rounded-sm bg-background/50 text-sm h-9"><SelectValue placeholder="Was the Phase 1 AI screen correct?" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Correct">Correct — AI assessment matched outcome</SelectItem>
                      <SelectItem value="Partially-correct">Partially-correct — some elements were wrong</SelectItem>
                      <SelectItem value="Wrong">Wrong — AI assessment was misleading</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {["Partially-correct", "Wrong"].includes(phase1VerdictAccuracy) && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Accuracy Note <span className="text-destructive">*</span>
                    </label>
                    <Textarea
                      value={phase1VerdictNote}
                      onChange={(e) => setPhase1VerdictNote(e.target.value)}
                      className="rounded-sm bg-background/50 resize-none h-16"
                      placeholder="Briefly describe what the AI got wrong or missed…"
                    />
                    {!phase1VerdictNote.trim() && (
                      <p className="text-[10px] text-destructive font-mono">Note is required when accuracy is Partially-correct or Wrong.</p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Miss Theme <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <Select value={closeMissTheme} onValueChange={setCloseMissTheme}>
                    <SelectTrigger className="rounded-sm bg-background/50 text-sm h-9"><SelectValue placeholder="Tag a miss theme…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Strategy mismatch">Strategy mismatch</SelectItem>
                      <SelectItem value="Valuation gap">Valuation gap</SelectItem>
                      <SelectItem value="Competitive loss">Competitive loss</SelectItem>
                      <SelectItem value="Regulatory block">Regulatory block</SelectItem>
                      <SelectItem value="Management resistance">Management resistance</SelectItem>
                      <SelectItem value="Due diligence finding">Due diligence finding</SelectItem>
                      <SelectItem value="Timing">Timing</SelectItem>
                      <SelectItem value="AI false positive">AI false positive</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStageOpen(false); setStageVal(""); setStageReason(""); setCloseReasonCode(""); setPhase1VerdictAccuracy(""); setPhase1VerdictNote(""); setCloseMissTheme(""); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button onClick={handleUpdateStage} disabled={!stageVal || !stageReason.trim() || verdictIncomplete || updateStage.isPending} className="rounded-sm font-mono uppercase text-[10px]">
              {stageVal ? `Move to ${stageVal}` : "Select a Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Target */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[600px] border-border bg-sidebar rounded-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Edit Target</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-5">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1">Basic Info</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Project Name</label>
                  <Input value={editData.projectName} onChange={(e) => setEditData((d) => ({ ...d, projectName: e.target.value }))} className="rounded-sm bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Priority Tier</label>
                  <Select value={editData.priorityTier} onValueChange={(v) => setEditData((d) => ({ ...d, priorityTier: v }))}>
                    <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-sm">{PRIORITY_TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Deal Type</label>
                  {(() => {
                    const EARLY_STAGES = ["Sourcing", "Outreach", "Introductory Discussion", "NDA / CIM"];
                    const isEarlyStage = EARLY_STAGES.includes(target.currentStage ?? "Sourcing");
                    return (
                      <>
                        <Select
                          disabled={!isEarlyStage}
                          value={editData.dealType || "__none__"}
                          onValueChange={(v) => {
                            const newVal = v === "__none__" ? "" : v;
                            setDealTypeWarning(null);
                            setEditData((d) => ({ ...d, dealType: newVal }));
                          }}
                        >
                          <SelectTrigger className="rounded-sm bg-background/50"><SelectValue placeholder="Select deal type…" /></SelectTrigger>
                          <SelectContent className="rounded-sm">
                            <SelectItem value="__none__">— None —</SelectItem>
                            {DEAL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {dealTypeWarning && (
                          <p className="text-[10px] text-amber-500 font-mono">{dealTypeWarning}</p>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sector</label>
                  <Input value={editData.sector} onChange={(e) => setEditData((d) => ({ ...d, sector: e.target.value }))} className="rounded-sm bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Subsector</label>
                  <Input value={editData.subsector} onChange={(e) => setEditData((d) => ({ ...d, subsector: e.target.value }))} className="rounded-sm bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Country</label>
                  <Input value={editData.country} onChange={(e) => setEditData((d) => ({ ...d, country: e.target.value }))} className="rounded-sm bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Geography Region</label>
                  <Input value={editData.geographyRegion} onChange={(e) => setEditData((d) => ({ ...d, geographyRegion: e.target.value }))} className="rounded-sm bg-background/50" />
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1">Team</div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Deal Owner</label>
                  <Input value={editData.dealOwner} onChange={(e) => setEditData((d) => ({ ...d, dealOwner: e.target.value }))} className="rounded-sm bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Deal Champion</label>
                  <Input value={editData.dealChampion} onChange={(e) => setEditData((d) => ({ ...d, dealChampion: e.target.value }))} className="rounded-sm bg-background/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Exec Sponsor</label>
                  <Input value={editData.executiveSponsor} onChange={(e) => setEditData((d) => ({ ...d, executiveSponsor: e.target.value }))} className="rounded-sm bg-background/50" />
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1">Scores (0–100)</div>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { label: "Strategic Fit", key: "strategicFitScore" as const },
                  { label: "Synergy Potential", key: "synergyScore" as const },
                  { label: "Financial Attractiveness", key: "financialAttractivenessScore" as const },
                  { label: "Process Maturity", key: "processMaturityScore" as const },
                  { label: "Risk Penalty", key: "riskPenaltyScore" as const },
                ]).map(({ label, key }) => (
                  <div key={key} className="space-y-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</label>
                    <Input
                      type="number" min={0} max={100}
                      value={editData[key]}
                      onChange={(e) => setEditData((d) => ({ ...d, [key]: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                      className="rounded-sm bg-background/50"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Strategic Rationale</label>
              <Textarea value={editData.strategicRationale} onChange={(e) => setEditData((d) => ({ ...d, strategicRationale: e.target.value }))} className="rounded-sm bg-background/50 resize-none h-24" placeholder="Why is this target strategically valuable?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button onClick={handleUpdateTarget} disabled={updateTarget.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteTarget} disabled={deleteTarget.isPending} className="rounded-sm font-mono uppercase text-[10px]">Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Opportunity Brief Dialog */}
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
              <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground/90">
                {briefContent}
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t border-border/60 pt-3 mt-0">
            {briefContent && !briefSetupRequired && !briefBillingRequired && (
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(briefContent ?? "").catch(() => {});
                  setBriefCopied(true);
                  setTimeout(() => setBriefCopied(false), 2000);
                }}
                className="rounded-sm font-mono text-[10px] uppercase gap-1"
              >
                {briefCopied ? <Check size={11} /> : <Copy size={11} />}
                {briefCopied ? "Copied" : "Copy Brief"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleGenerateBrief} disabled={briefLoading} className="rounded-sm font-mono text-[10px] uppercase gap-1">
              <Sparkles size={11} /> Regenerate
            </Button>
            <Button size="sm" onClick={() => setAiBriefOpen(false)} className="rounded-sm font-mono text-[10px] uppercase">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
