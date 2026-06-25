import React, { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetTarget, getGetTargetQueryKey,
  useUpdateTargetStage,
  useListInteractions, getListInteractionsQueryKey,
  useCreateInteraction,
  useUpdateInteraction,
  useDeleteInteraction,
  useListActions, getListActionsQueryKey,
  useCreateAction,
  useUpdateAction,
  useDeleteAction,
  useGetStageHistory, getGetStageHistoryQueryKey,
  useDeleteTarget,
  useUpdateTarget,
  useGetActivityFeed, getGetActivityFeedQueryKey,
  useListIcSessions, getListIcSessionsQueryKey,
  useCreateIcSession,
  useDeleteIcSession,
  useGetStageGate,
} from "@workspace/api-client-react";
import { LinkifiedText } from "@/components/linkified-text";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Target as TargetIcon, Plus, ShieldAlert, Edit, Trash2,
  CheckCircle2, RotateCcw, Pencil, MessageSquare, ListChecks, GitBranch,
  LayoutGrid, ClipboardCheck, FolderOpen, Sparkles, Loader2, Copy, Check, Bot,
  ChevronDown, ChevronRight, Activity as ActivityIcon, Scale, TrendingUp,
  AlertTriangle, Download, Users, ShieldCheck, ClipboardList, Hash, Shield,
} from "lucide-react";
import {
  formatScore, getScoreConfidence, countAssessedScores,
  type ScoreField,
} from "@/lib/score-utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format, parseISO, differenceInDays, formatDistanceToNow } from "date-fns";
import { DiligenceTab } from "@/pages/target-detail-diligence";
import { DocumentsTab } from "@/pages/target-detail-documents";
import { ValuationTab } from "@/pages/target-detail-valuation";
import { SynergiesTab } from "@/pages/target-detail-synergies";
import { StakeholdersTab } from "@/pages/target-detail-stakeholders";
import { ComplianceTab } from "@/pages/target-detail-compliance";
import { AuditTrailTab } from "@/components/audit-trail-tab";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StageRail, PIPELINE_STAGE_ORDER, ALL_KNOWN_STAGES, OFF_TRACK_STAGES, getStagesForDealType } from "@/components/stage-rail";
import { StageChip } from "@/components/stage-chip";
import { AiMeetingNotesModal } from "@/components/ai-meeting-notes-modal";
import { customFetch } from "@workspace/api-client-react";

const STAGES = [
  "Sourcing", "Outreach", "Introductory Discussion", "NDA / CIM",
  "Preliminary Due Diligence", "Management Meeting", "Non-Binding Offer",
  "Confirmatory Due Diligence", "Binding Offer", "SPA Negotiation",
  "Integration Planning", "Closed", "On Hold", "Dropped",
];
const INTERACTION_TYPES = ["Meeting", "Call", "Email", "Material Received", "Internal Review", "Site Visit", "Other"];
const SENTIMENTS = ["Positive", "Neutral", "Negative"];
const PRIORITY_TIERS = ["Must-Win", "Priority 1", "Priority 2", "Watchlist"];
const ACTION_PRIORITIES = ["Critical", "High", "Medium", "Low"];
const ACTION_STATUSES = ["Open", "In Progress", "Blocked", "Completed"];

type EditTargetData = {
  projectName: string;
  priorityTier: string;
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

type EditInterData = {
  id: number;
  interactionType: string;
  summary: string;
  participantsInternal: string;
  participantsExternal: string;
  sentiment: string;
  valuationSignal: string;
};

type EditActionData = {
  id: number;
  description: string;
  owner: string;
  dueDate: string;
  priority: string;
  status: string;
};

export default function TargetDetail() {
  const { id } = useParams();
  const targetId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  const [stageOpen, setStageOpen] = useState(false);
  const [stageVal, setStageVal] = useState("");
  const [stageReason, setStageReason] = useState("");

  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interType, setInterType] = useState("Meeting");
  const [interSummary, setInterSummary] = useState("");
  const [interParticipantsInternal, setInterParticipantsInternal] = useState("");
  const [interParticipantsExternal, setInterParticipantsExternal] = useState("");
  const [interSentiment, setInterSentiment] = useState("__none__");
  const [interValuationSignal, setInterValuationSignal] = useState("");

  const [editInterOpen, setEditInterOpen] = useState(false);
  const [editInterData, setEditInterData] = useState<EditInterData>({
    id: 0,
    interactionType: "Meeting",
    summary: "",
    participantsInternal: "",
    participantsExternal: "",
    sentiment: "__none__",
    valuationSignal: "",
  });

  const [actionOpen, setActionOpen] = useState(false);
  const [actionDesc, setActionDesc] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [actionDueDate, setActionDueDate] = useState("");
  const [actionPriority, setActionPriority] = useState("Medium");

  const [editActionOpen, setEditActionOpen] = useState(false);
  const [editActionData, setEditActionData] = useState<EditActionData>({
    id: 0,
    description: "",
    owner: "",
    dueDate: "",
    priority: "Medium",
    status: "Open",
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<EditTargetData>({
    projectName: "",
    priorityTier: "",
    strategicRationale: "",
    sector: "",
    subsector: "",
    geographyRegion: "",
    country: "",
    dealOwner: "",
    dealChampion: "",
    executiveSponsor: "",
    strategicFitScore: 50,
    synergyScore: 50,
    financialAttractivenessScore: 50,
    processMaturityScore: 50,
    riskPenaltyScore: 0,
  });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [deleteInterOpen, setDeleteInterOpen] = useState(false);
  const [deleteInterId, setDeleteInterId] = useState<number | null>(null);

  const [deleteActionOpen, setDeleteActionOpen] = useState(false);
  const [deleteActionId, setDeleteActionId] = useState<number | null>(null);

  // IC Sessions state
  const [icAddOpen, setIcAddOpen] = useState(false);
  const [icDeleteOpen, setIcDeleteOpen] = useState(false);
  const [icDeleteId, setIcDeleteId] = useState<number | null>(null);
  const [icDate, setIcDate] = useState("");
  const [icAttendees, setIcAttendees] = useState("");
  const [icOutcome, setIcOutcome] = useState<"Approved" | "Conditional" | "Rejected" | "Deferred">("Approved");
  const [icConditions, setIcConditions] = useState("");
  const [icNotes, setIcNotes] = useState("");

  const [aiNotesOpen, setAiNotesOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("ai") === "meeting-notes";
  });
  const [aiBriefOpen, setAiBriefOpen] = useState(false);
  const [briefContent, setBriefContent] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefSetupRequired, setBriefSetupRequired] = useState(false);
  const [briefBillingRequired, setBriefBillingRequired] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);

  const { data: target, isLoading: loadingTarget } = useGetTarget(targetId, {
    query: { enabled: !!targetId, queryKey: getGetTargetQueryKey(targetId) },
  });
  const { data: interactions, isLoading: loadingInteractions } = useListInteractions(targetId, {
    query: { enabled: !!targetId, queryKey: getListInteractionsQueryKey(targetId) },
  });
  const { data: actions, isLoading: loadingActions } = useListActions(targetId, {
    query: { enabled: !!targetId, queryKey: getListActionsQueryKey(targetId) },
  });
  const { data: history, isLoading: loadingHistory } = useGetStageHistory(targetId, {
    query: { enabled: !!targetId, queryKey: getGetStageHistoryQueryKey(targetId) },
  });
  const { data: activityFeed, isLoading: loadingActivity } = useGetActivityFeed(targetId, {
    query: { enabled: !!targetId && activeTab === "activity", queryKey: getGetActivityFeedQueryKey(targetId) },
  });

  const { data: icSessions, isLoading: loadingIcSessions } = useListIcSessions(targetId, {
    query: { enabled: !!targetId && activeTab === "ic", queryKey: getListIcSessionsQueryKey(targetId) },
  });
  const { data: stageGateData, isFetching: loadingGate } = useGetStageGate(
    targetId,
    { newStage: stageVal },
    { query: { enabled: !!stageVal && stageOpen, queryKey: [`/api/targets/${targetId}/stage-gate`, { newStage: stageVal }] } },
  );

  const updateStage = useUpdateTargetStage();
  const createInteraction = useCreateInteraction();
  const updateInteraction = useUpdateInteraction();
  const createAction = useCreateAction();
  const updateAction = useUpdateAction();
  const updateTarget = useUpdateTarget();
  const deleteTarget = useDeleteTarget();
  const deleteInteraction = useDeleteInteraction();
  const deleteAction = useDeleteAction();
  const createIcSession = useCreateIcSession();
  const deleteIcSession = useDeleteIcSession();

  useEffect(() => {
    if (target) {
      setEditData({
        projectName: target.projectName ?? "",
        priorityTier: target.priorityTier ?? "",
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
    }
  }, [target]);

  const resetInterForm = () => {
    setInterType("Meeting");
    setInterSummary("");
    setInterParticipantsInternal("");
    setInterParticipantsExternal("");
    setInterSentiment("__none__");
    setInterValuationSignal("");
  };
  const resetActionForm = () => {
    setActionDesc("");
    setActionOwner("");
    setActionDueDate("");
    setActionPriority("Medium");
  };

  const invalidateTarget = () => queryClient.invalidateQueries({ queryKey: getGetTargetQueryKey(targetId) });
  const invalidateInteractions = () => queryClient.invalidateQueries({ queryKey: getListInteractionsQueryKey(targetId) });
  const invalidateActions = () => queryClient.invalidateQueries({ queryKey: getListActionsQueryKey(targetId) });
  const invalidateHistory = () => queryClient.invalidateQueries({ queryKey: getGetStageHistoryQueryKey(targetId) });
  const invalidateIcSessions = () => queryClient.invalidateQueries({ queryKey: getListIcSessionsQueryKey(targetId) });

  const resetIcForm = () => {
    setIcDate("");
    setIcAttendees("");
    setIcOutcome("Approved");
    setIcConditions("");
    setIcNotes("");
  };

  const handleCreateIcSession = () => {
    if (!icDate || !icOutcome) return;
    createIcSession.mutate(
      { id: targetId, data: { sessionDate: icDate, attendees: icAttendees || null, outcome: icOutcome, conditions: icConditions || null, notes: icNotes || null } },
      {
        onSuccess: () => {
          toast({ title: "IC Session Recorded" });
          setIcAddOpen(false);
          resetIcForm();
          invalidateIcSessions();
        },
        onError: () => toast({ title: "Error", description: "Could not record IC session", variant: "destructive" }),
      }
    );
  };

  const handleDeleteIcSession = () => {
    if (!icDeleteId) return;
    deleteIcSession.mutate(
      { id: icDeleteId },
      {
        onSuccess: () => {
          toast({ title: "IC Session Deleted" });
          setIcDeleteOpen(false);
          setIcDeleteId(null);
          invalidateIcSessions();
        },
        onError: () => toast({ title: "Error", description: "Could not delete IC session", variant: "destructive" }),
      }
    );
  };

  // Auto-open brief when navigated here from Copilot with ?ai=opportunity-brief
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

  const handleUpdateStage = () => {
    if (!stageVal || !stageReason.trim()) return;
    updateStage.mutate(
      { id: targetId, data: { newStage: stageVal, changeReason: stageReason } },
      {
        onSuccess: () => {
          toast({ title: "Stage Updated", description: `Moved to ${stageVal}` });
          setStageOpen(false); setStageVal(""); setStageReason("");
          invalidateTarget(); invalidateHistory();
        },
        onError: () => toast({ title: "Error", description: "Stage update failed", variant: "destructive" }),
      }
    );
  };

  const handleCreateInteraction = () => {
    if (!interSummary) return;
    createInteraction.mutate(
      {
        id: targetId,
        data: {
          interactionType: interType,
          summary: interSummary,
          participantsInternal: interParticipantsInternal || null,
          participantsExternal: interParticipantsExternal || null,
          sentiment: interSentiment === "__none__" ? null : interSentiment || null,
          valuationSignal: interValuationSignal || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Interaction Logged" });
          setInteractionOpen(false); resetInterForm(); invalidateInteractions();
        },
        onError: () => toast({ title: "Error", description: "Could not log interaction", variant: "destructive" }),
      }
    );
  };

  const openEditInteraction = (inter: NonNullable<typeof interactions>[number]) => {
    setEditInterData({
      id: inter.id,
      interactionType: inter.interactionType ?? "Meeting",
      summary: inter.summary ?? "",
      participantsInternal: inter.participantsInternal ?? "",
      participantsExternal: inter.participantsExternal ?? "",
      sentiment: inter.sentiment || "__none__",
      valuationSignal: inter.valuationSignal ?? "",
    });
    setEditInterOpen(true);
  };

  const handleUpdateInteraction = () => {
    if (!editInterData.summary) return;
    updateInteraction.mutate(
      {
        id: editInterData.id,
        data: {
          interactionType: editInterData.interactionType || undefined,
          summary: editInterData.summary || undefined,
          participantsInternal: editInterData.participantsInternal || null,
          participantsExternal: editInterData.participantsExternal || null,
          sentiment: editInterData.sentiment === "__none__" ? null : editInterData.sentiment || null,
          valuationSignal: editInterData.valuationSignal || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Interaction Updated" });
          setEditInterOpen(false); invalidateInteractions();
        },
        onError: () => toast({ title: "Error", description: "Could not update interaction", variant: "destructive" }),
      }
    );
  };

  const handleCreateAction = () => {
    if (!actionDesc) return;
    createAction.mutate(
      {
        id: targetId,
        data: {
          description: actionDesc,
          priority: actionPriority,
          owner: actionOwner || undefined,
          dueDate: actionDueDate || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Action Added" });
          setActionOpen(false); resetActionForm(); invalidateActions();
        },
        onError: () => toast({ title: "Error", description: "Could not add action", variant: "destructive" }),
      }
    );
  };

  const openEditAction = (action: NonNullable<typeof actions>[number]) => {
    setEditActionData({
      id: action.id,
      description: action.description ?? "",
      owner: action.owner ?? "",
      dueDate: action.dueDate ?? "",
      priority: action.priority ?? "Medium",
      status: action.status ?? "Open",
    });
    setEditActionOpen(true);
  };

  const handleUpdateAction = () => {
    updateAction.mutate(
      {
        id: editActionData.id,
        data: {
          description: editActionData.description || undefined,
          owner: editActionData.owner || null,
          dueDate: editActionData.dueDate || null,
          priority: editActionData.priority || undefined,
          status: editActionData.status || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Action Updated" });
          setEditActionOpen(false); invalidateActions();
        },
        onError: () => toast({ title: "Error", description: "Could not update action", variant: "destructive" }),
      }
    );
  };

  const handleToggleActionComplete = (actionId: number, currentStatus: string) => {
    const newStatus = currentStatus === "Completed" ? "Open" : "Completed";
    updateAction.mutate(
      { id: actionId, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: newStatus === "Completed" ? "Marked Complete" : "Reopened" });
          invalidateActions();
        },
        onError: () => toast({ title: "Error", description: "Could not update action", variant: "destructive" }),
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

  const handleDeleteInteraction = () => {
    if (!deleteInterId) return;
    deleteInteraction.mutate(
      { id: deleteInterId },
      {
        onSuccess: () => {
          toast({ title: "Interaction Deleted" });
          setDeleteInterOpen(false);
          setDeleteInterId(null);
          invalidateInteractions();
        },
        onError: () => toast({ title: "Error", description: "Could not delete interaction", variant: "destructive" }),
      }
    );
  };

  const handleDeleteAction = () => {
    if (!deleteActionId) return;
    deleteAction.mutate(
      { id: deleteActionId },
      {
        onSuccess: () => {
          toast({ title: "Action Deleted" });
          setDeleteActionOpen(false);
          setDeleteActionId(null);
          invalidateActions();
        },
        onError: () => toast({ title: "Error", description: "Could not delete action", variant: "destructive" }),
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

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-500";
    if (score >= 60) return "text-primary";
    if (score >= 40) return "text-amber-500";
    return "text-destructive";
  };

  const getStageBadgeClass = (stage: string) => {
    if (stage === "Closed" || stage === "Completed" || stage === "Signed") return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    if (stage === "Dropped" || stage === "Rejected") return "bg-destructive/10 text-destructive border-destructive/20";
    if (stage === "On Hold") return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    return "bg-muted/50 text-muted-foreground border-border/60";
  };

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

  const openActions = (actions ?? []).filter((a) => a.status !== "Completed");
  const completedActions = (actions ?? []).filter((a) => a.status === "Completed");

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
                <Button size="sm" className="rounded-lg font-mono uppercase text-[10px] gap-1.5 tracking-wider h-8" onClick={() => setStageOpen(true)}>
                  <TargetIcon size={12} /> Change Stage
                </Button>
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
                { value: "overview", label: "Overview", icon: <LayoutGrid size={13} /> },
                { value: "interactions", label: "Log", icon: <MessageSquare size={13} /> },
                { value: "actions", label: "Actions", icon: <ListChecks size={13} /> },
                { value: "history", label: "Timeline", icon: <GitBranch size={13} /> },
                { value: "diligence",  label: "Diligence",  icon: <ClipboardCheck size={13} /> },
                { value: "documents",  label: "Documents",  icon: <FolderOpen size={13} /> },
                { value: "valuation",  label: "Valuation",  icon: <TrendingUp size={13} /> },
                { value: "synergies",  label: "Synergies",  icon: <Sparkles size={13} /> },
                { value: "activity",   label: "Activity",   icon: <ActivityIcon size={13} /> },
                { value: "ic",         label: "IC",         icon: <Scale size={13} /> },
                { value: "stakeholders", label: "Stakeholders", icon: <Users size={13} /> },
                { value: "compliance",   label: "Compliance",   icon: <ShieldCheck size={13} /> },
                { value: "audit",        label: "Audit",        icon: <ClipboardList size={13} /> },
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

            {/* Overview */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-sm font-mono text-[10px] uppercase border-border/60 h-7 px-2.5 gap-1.5"
                  onClick={() => { window.location.href = `/api/export/memo/${targetId}`; }}
                >
                  <Download size={11} /> Export Memo
                </Button>
              </div>
              <OverviewSections target={target} actions={actions ?? []} />
            </TabsContent>

            {/* Interactions */}
            <TabsContent value="interactions" className="space-y-4 mt-0">
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex rounded-sm font-mono text-[10px] uppercase border-primary/30 text-primary hover:bg-primary/5 gap-1"
                  onClick={() => setAiNotesOpen(true)}
                >
                  <Sparkles size={11} /><span className="hidden sm:inline">Parse Notes with AI</span>
                </Button>
                <Button size="sm" variant="outline" className="hidden md:flex rounded-sm font-mono text-[10px] uppercase border-border" onClick={() => setInteractionOpen(true)}>
                  <Plus size={13} className="mr-1" /> Log Interaction
                </Button>
              </div>
              {loadingInteractions ? (
                <Skeleton className="h-32 w-full" />
              ) : !interactions?.length ? (
                <div className="border border-dashed border-border rounded-sm py-16 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
                  No interactions logged yet
                </div>
              ) : (
                <div className="space-y-3">
                  {interactions.map((inter) => (
                    <Card key={inter.id} className="bg-card/30 border-border rounded-sm group">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-sm">{inter.interactionType}</Badge>
                            {inter.sentiment && (
                              <Badge variant="outline" className={`font-mono text-[10px] uppercase rounded-sm ${
                                inter.sentiment === "Positive" ? "text-emerald-500 border-emerald-500/30" :
                                inter.sentiment === "Negative" ? "text-destructive border-destructive/30" :
                                inter.sentiment === "Neutral" ? "text-amber-500 border-amber-500/30" :
                                "text-muted-foreground"
                              }`}>
                                {inter.sentiment}
                              </Badge>
                            )}
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {inter.interactionDatetime ? format(parseISO(inter.interactionDatetime), "MMM d, yyyy · HH:mm") : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity" onClick={() => openEditInteraction(inter)}>
                              <Pencil size={12} />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 transition-opacity" onClick={() => { setDeleteInterId(inter.id); setDeleteInterOpen(true); }}>
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-2">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          <LinkifiedText text={inter.summary ?? ""} />
                        </p>
                        {(inter.participantsInternal || inter.participantsExternal) && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                            {inter.participantsInternal && (
                              <div className="text-[10px] font-mono text-muted-foreground">
                                <span className="uppercase tracking-wider">Internal: </span>{inter.participantsInternal}
                              </div>
                            )}
                            {inter.participantsExternal && (
                              <div className="text-[10px] font-mono text-muted-foreground">
                                <span className="uppercase tracking-wider">External: </span>{inter.participantsExternal}
                              </div>
                            )}
                          </div>
                        )}
                        {inter.valuationSignal && (
                          <div className="text-[10px] font-mono text-muted-foreground">
                            <span className="uppercase tracking-wider">Valuation Signal: </span>{inter.valuationSignal}
                          </div>
                        )}
                        {inter.createdBy && (
                          <div className="text-[10px] font-mono text-muted-foreground">
                            <span className="uppercase tracking-wider">By: </span>{inter.createdBy}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Actions */}
            <TabsContent value="actions" className="space-y-4 mt-0">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" className="hidden md:flex rounded-sm font-mono text-[10px] uppercase border-border" onClick={() => setActionOpen(true)}>
                  <Plus size={13} className="mr-1" /> Add Action
                </Button>
              </div>
              {loadingActions ? (
                <Skeleton className="h-32 w-full" />
              ) : !actions?.length ? (
                <div className="border border-dashed border-border rounded-sm py-16 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
                  No actions yet
                </div>
              ) : (
                <div className="space-y-6">
                  {openActions.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Open ({openActions.length})</div>
                      <div className="space-y-2">
                        {openActions.map((action) => (
                          <ActionRow key={action.id} action={action} onEdit={() => openEditAction(action)} onToggle={() => handleToggleActionComplete(action.id, action.status)} onDelete={() => { setDeleteActionId(action.id); setDeleteActionOpen(true); }} isPending={updateAction.isPending} />
                        ))}
                      </div>
                    </div>
                  )}
                  {completedActions.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Completed ({completedActions.length})</div>
                      <div className="space-y-2 opacity-60">
                        {completedActions.map((action) => (
                          <ActionRow key={action.id} action={action} onEdit={() => openEditAction(action)} onToggle={() => handleToggleActionComplete(action.id, action.status)} onDelete={() => { setDeleteActionId(action.id); setDeleteActionOpen(true); }} isPending={updateAction.isPending} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Timeline */}
            <TabsContent value="history" className="mt-0">
              {loadingHistory ? (
                <Skeleton className="h-32 w-full" />
              ) : !history?.length ? (
                <div className="border border-dashed border-border rounded-sm py-16 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
                  No stage changes recorded
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-0">
                    {history.map((entry, i) => (
                      <div key={entry.id} className="relative pl-10 pb-6">
                        <div className={`absolute left-[13px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-background ${i === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                          {entry.changedAt ? format(parseISO(entry.changedAt), "MMM d, yyyy · HH:mm") : "—"}
                        </div>
                        <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          {entry.previousStage && (
                            <>
                              <StageChip stage={entry.previousStage} size="xs" />
                              <span className="text-muted-foreground text-xs">→</span>
                            </>
                          )}
                          <StageChip stage={entry.newStage} size="xs" />
                        </div>
                        {entry.changeReason && (
                          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                            <LinkifiedText text={entry.changeReason} />
                          </p>
                        )}
                        {entry.changedBy && (
                          <div className="text-[10px] font-mono text-muted-foreground mt-1">by {entry.changedBy}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* IC Sessions */}
            <TabsContent value="ic" className="space-y-4 mt-0">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                  Investment Committee Sessions
                </div>
                <Button size="sm" variant="outline" className="rounded-sm font-mono text-[10px] uppercase border-border" onClick={() => setIcAddOpen(true)}>
                  <Plus size={13} className="mr-1" /> Add IC Session
                </Button>
              </div>
              {loadingIcSessions ? (
                <Skeleton className="h-32 w-full" />
              ) : !icSessions?.length ? (
                <div className="border border-dashed border-border rounded-sm py-16 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest flex flex-col items-center gap-2">
                  <Scale size={20} className="text-muted-foreground/40" />
                  No IC sessions recorded
                </div>
              ) : (
                <div className="space-y-3">
                  {icSessions.map((session) => {
                    const outcomeStyle =
                      session.outcome === "Approved"   ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25" :
                      session.outcome === "Conditional" ? "bg-amber-500/10 text-amber-500 border-amber-500/25" :
                      session.outcome === "Rejected"   ? "bg-destructive/10 text-destructive border-destructive/25" :
                      "bg-muted/50 text-muted-foreground border-border/60";
                    return (
                      <Card key={session.id} className="bg-card/30 border-border rounded-sm group">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`font-mono text-[10px] uppercase rounded-sm ${outcomeStyle}`}>
                                {session.outcome}
                              </Badge>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {session.sessionDate || "—"}
                              </span>
                              {session.attendees && (
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  · {session.attendees}
                                </span>
                              )}
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive/60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={() => { setIcDeleteId(session.id); setIcDeleteOpen(true); }}
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </CardHeader>
                        {(session.conditions || session.notes) && (
                          <CardContent className="px-4 pb-4 space-y-1.5">
                            {session.outcome === "Conditional" && session.conditions && (
                              <div className="text-sm text-amber-500/90 leading-relaxed">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-1">Conditions:</span>
                                {session.conditions}
                              </div>
                            )}
                            {session.notes && (
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{session.notes}</p>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Stakeholders */}
            <TabsContent value="stakeholders" className="mt-0">
              <StakeholdersTab targetId={targetId} />
            </TabsContent>

            {/* Compliance */}
            <TabsContent value="compliance" className="mt-0">
              <ComplianceTab targetId={targetId} />
            </TabsContent>

            {/* Audit Trail */}
            <TabsContent value="audit" className="mt-0">
              <AuditTrailTab targetId={targetId} />
            </TabsContent>

            {/* Diligence */}
            <TabsContent value="diligence" className="space-y-4 mt-0">
              <DiligenceTab targetId={targetId} />
            </TabsContent>

            {/* Documents */}
            <TabsContent value="documents" className="space-y-4 mt-0">
              <DocumentsTab targetId={targetId} />
            </TabsContent>

            {/* Valuation */}
            <TabsContent value="valuation" className="mt-0">
              <ValuationTab targetId={targetId} currentStage={target.currentStage ?? undefined} />
            </TabsContent>

            {/* Synergies */}
            <TabsContent value="synergies" className="mt-0">
              <SynergiesTab targetId={targetId} currentStage={target.currentStage ?? "Sourcing"} />
            </TabsContent>

            {/* Activity Feed */}
            <TabsContent value="activity" className="mt-0">
              {loadingActivity ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => <Skeleton key={n} className="h-14 w-full" />)}
                </div>
              ) : !activityFeed?.length ? (
                <div className="border border-dashed border-border rounded-sm py-16 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest flex flex-col items-center gap-2">
                  <ActivityIcon size={20} className="text-muted-foreground/40" />
                  No activity recorded yet
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border/60" />
                  <div className="space-y-0">
                    {activityFeed.map((event, i) => {
                      const Icon = event.type === "stage_changed" ? GitBranch
                        : event.type === "interaction" ? MessageSquare
                        : event.type === "action_created" ? ListChecks
                        : event.type === "action_completed" ? CheckCircle2
                        : event.type === "diligence_completed" ? ClipboardCheck
                        : FolderOpen;
                      const iconColor = event.type === "stage_changed" ? "text-primary"
                        : event.type === "interaction" ? "text-blue-400"
                        : event.type === "action_created" ? "text-muted-foreground"
                        : event.type === "action_completed" ? "text-emerald-500"
                        : event.type === "diligence_completed" ? "text-violet-400"
                        : "text-amber-400";
                      let relativeTime = "";
                      try {
                        relativeTime = formatDistanceToNow(new Date(event.timestamp), { addSuffix: true });
                      } catch {
                        relativeTime = "";
                      }
                      return (
                        <div key={i} className="relative pl-10 pb-5">
                          <div className="absolute left-[9px] top-1 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center">
                            <Icon size={10} className={iconColor} />
                          </div>
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="min-w-0">
                              <div className="text-sm font-medium leading-snug">{event.title}</div>
                              {event.detail && (
                                <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{event.detail}</div>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground/60 shrink-0 mt-0.5" title={event.timestamp}>
                              {relativeTime}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar/95 backdrop-blur-sm p-3 flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase border-border" onClick={() => setInteractionOpen(true)}>
          <MessageSquare size={13} className="mr-1" /> Log
        </Button>
        <Button variant="outline" size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase border-border" onClick={() => setActionOpen(true)}>
          <Plus size={13} className="mr-1" /> Add Action
        </Button>
        <Button size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase" onClick={() => setStageOpen(true)}>
          <TargetIcon size={13} className="mr-1" /> Change Stage
        </Button>
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
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Current Stage
              </div>
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
              {/* Off-track stage options — always available regardless of current stage */}
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
                    ? "Required — state the primary reason this deal is being dropped (e.g. Price mismatch, Owner unwilling to sell)"
                    : stageVal === "On Hold"
                    ? "Required — explain why the deal is being put on hold"
                    : "Required — explain the reason for this stage change"
                }
              />
              {stageVal && !stageReason.trim() && (
                <p className="text-[10px] text-destructive font-mono">A reason is required to change stage.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStageOpen(false); setStageVal(""); setStageReason(""); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button onClick={handleUpdateStage} disabled={!stageVal || !stageReason.trim() || updateStage.isPending} className="rounded-sm font-mono uppercase text-[10px]">
              {stageVal ? `Move to ${stageVal}` : "Select a Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Interaction */}
      <Dialog open={interactionOpen} onOpenChange={(open) => { if (!open) resetInterForm(); setInteractionOpen(open); }}>
        <DialogContent className="sm:max-w-[540px] border-border bg-sidebar rounded-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Record Deal Activity</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Type <span className="text-destructive">*</span></label>
                <Select value={interType} onValueChange={setInterType}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">{INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sentiment</label>
                <Select value={interSentiment} onValueChange={setInterSentiment}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent className="rounded-sm">
                    <SelectItem value="__none__">— None —</SelectItem>
                    {SENTIMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Summary <span className="text-destructive">*</span></label>
              <Textarea value={interSummary} onChange={(e) => setInterSummary(e.target.value)} className="rounded-sm bg-background/50 resize-none h-24" placeholder="Key takeaways, decisions, next steps…" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Internal Participants</label>
                <Input value={interParticipantsInternal} onChange={(e) => setInterParticipantsInternal(e.target.value)} className="rounded-sm bg-background/50" placeholder="Alice, Bob…" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">External Participants</label>
                <Input value={interParticipantsExternal} onChange={(e) => setInterParticipantsExternal(e.target.value)} className="rounded-sm bg-background/50" placeholder="CEO, CFO…" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Valuation Signal</label>
              <Input value={interValuationSignal} onChange={(e) => setInterValuationSignal(e.target.value)} className="rounded-sm bg-background/50" placeholder="e.g. 8–10× EBITDA, seller wants ≥$200M…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInteractionOpen(false); resetInterForm(); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button onClick={handleCreateInteraction} disabled={!interSummary || createInteraction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save Log</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Interaction */}
      <Dialog open={editInterOpen} onOpenChange={setEditInterOpen}>
        <DialogContent className="sm:max-w-[540px] border-border bg-sidebar rounded-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Edit Interaction</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Type</label>
                <Select value={editInterData.interactionType} onValueChange={(v) => setEditInterData((d) => ({ ...d, interactionType: v }))}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">{INTERACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sentiment</label>
                <Select value={editInterData.sentiment} onValueChange={(v) => setEditInterData((d) => ({ ...d, sentiment: v }))}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent className="rounded-sm">
                    <SelectItem value="__none__">— None —</SelectItem>
                    {SENTIMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Summary <span className="text-destructive">*</span></label>
              <Textarea value={editInterData.summary} onChange={(e) => setEditInterData((d) => ({ ...d, summary: e.target.value }))} className="rounded-sm bg-background/50 resize-none h-24" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Internal Participants</label>
                <Input value={editInterData.participantsInternal} onChange={(e) => setEditInterData((d) => ({ ...d, participantsInternal: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">External Participants</label>
                <Input value={editInterData.participantsExternal} onChange={(e) => setEditInterData((d) => ({ ...d, participantsExternal: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Valuation Signal</label>
              <Input value={editInterData.valuationSignal} onChange={(e) => setEditInterData((d) => ({ ...d, valuationSignal: e.target.value }))} className="rounded-sm bg-background/50" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditInterOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button onClick={handleUpdateInteraction} disabled={!editInterData.summary || updateInteraction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Action */}
      <Dialog open={actionOpen} onOpenChange={(open) => { if (!open) resetActionForm(); setActionOpen(open); }}>
        <DialogContent className="sm:max-w-[500px] border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Add Action Item</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Description <span className="text-destructive">*</span></label>
              <Textarea value={actionDesc} onChange={(e) => setActionDesc(e.target.value)} className="rounded-sm bg-background/50 resize-none h-20" placeholder="What needs to be done?" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Priority</label>
                <Select value={actionPriority} onValueChange={setActionPriority}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">{ACTION_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Due Date</label>
                <Input type="date" value={actionDueDate} onChange={(e) => setActionDueDate(e.target.value)} className="rounded-sm bg-background/50" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Owner</label>
              <Input value={actionOwner} onChange={(e) => setActionOwner(e.target.value)} className="rounded-sm bg-background/50" placeholder="Who is responsible?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionOpen(false); resetActionForm(); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button onClick={handleCreateAction} disabled={!actionDesc || createAction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Add Action</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Action */}
      <Dialog open={editActionOpen} onOpenChange={setEditActionOpen}>
        <DialogContent className="sm:max-w-[500px] border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Edit Action Item</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Description <span className="text-destructive">*</span></label>
              <Textarea value={editActionData.description} onChange={(e) => setEditActionData((d) => ({ ...d, description: e.target.value }))} className="rounded-sm bg-background/50 resize-none h-20" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Priority</label>
                <Select value={editActionData.priority} onValueChange={(v) => setEditActionData((d) => ({ ...d, priority: v }))}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">{ACTION_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Status</label>
                <Select value={editActionData.status} onValueChange={(v) => setEditActionData((d) => ({ ...d, status: v }))}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">{ACTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Due Date</label>
                <Input type="date" value={editActionData.dueDate} onChange={(e) => setEditActionData((d) => ({ ...d, dueDate: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Owner</label>
                <Input value={editActionData.owner} onChange={(e) => setEditActionData((d) => ({ ...d, owner: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditActionOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button onClick={handleUpdateAction} disabled={!editActionData.description || updateAction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save Changes</Button>
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
                {(
                  [
                    { label: "Strategic Fit", key: "strategicFitScore" as const },
                    { label: "Synergy Potential", key: "synergyScore" as const },
                    { label: "Financial Attractiveness", key: "financialAttractivenessScore" as const },
                    { label: "Process Maturity", key: "processMaturityScore" as const },
                    { label: "Risk Penalty", key: "riskPenaltyScore" as const },
                  ]
                ).map(({ label, key }) => (
                  <div key={key} className="space-y-2">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
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

      {/* Delete Interaction */}
      <Dialog open={deleteInterOpen} onOpenChange={(open) => { if (!open) setDeleteInterId(null); setDeleteInterOpen(open); }}>
        <DialogContent className="sm:max-w-[400px] border-destructive bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg text-destructive">Delete Interaction</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will permanently remove the interaction log entry. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteInterOpen(false); setDeleteInterId(null); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteInteraction} disabled={deleteInteraction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Action */}
      <Dialog open={deleteActionOpen} onOpenChange={(open) => { if (!open) setDeleteActionId(null); setDeleteActionOpen(open); }}>
        <DialogContent className="sm:max-w-[400px] border-destructive bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg text-destructive">Delete Action</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will permanently remove the action item. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteActionOpen(false); setDeleteActionId(null); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAction} disabled={deleteAction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Delete</Button>
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
                variant="outline"
                size="sm"
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateBrief}
              disabled={briefLoading}
              className="rounded-sm font-mono text-[10px] uppercase gap-1"
            >
              <Sparkles size={11} /> Regenerate
            </Button>
            <Button
              size="sm"
              onClick={() => setAiBriefOpen(false)}
              className="rounded-sm font-mono text-[10px] uppercase"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add IC Session */}
      <Dialog open={icAddOpen} onOpenChange={(open) => { if (!open) resetIcForm(); setIcAddOpen(open); }}>
        <DialogContent className="sm:max-w-[500px] border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Record IC Session</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Date <span className="text-destructive">*</span></label>
                <Input type="date" value={icDate} onChange={(e) => setIcDate(e.target.value)} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Outcome <span className="text-destructive">*</span></label>
                <Select value={icOutcome} onValueChange={(v) => setIcOutcome(v as typeof icOutcome)}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">
                    {(["Approved", "Conditional", "Rejected", "Deferred"] as const).map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Attendees</label>
              <Input value={icAttendees} onChange={(e) => setIcAttendees(e.target.value)} className="rounded-sm bg-background/50" placeholder="Names or roles…" />
            </div>
            {icOutcome === "Conditional" && (
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Conditions</label>
                <Textarea value={icConditions} onChange={(e) => setIcConditions(e.target.value)} className="rounded-sm bg-background/50 resize-none h-16" placeholder="Conditions for approval…" />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Notes</label>
              <Textarea value={icNotes} onChange={(e) => setIcNotes(e.target.value)} className="rounded-sm bg-background/50 resize-none h-20" placeholder="Key discussion points, decisions…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIcAddOpen(false); resetIcForm(); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button onClick={handleCreateIcSession} disabled={!icDate || !icOutcome || createIcSession.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save Session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete IC Session */}
      <Dialog open={icDeleteOpen} onOpenChange={(open) => { setIcDeleteOpen(open); if (!open) setIcDeleteId(null); }}>
        <DialogContent className="sm:max-w-[400px] border-destructive bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg text-destructive">Delete IC Session</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">This will permanently remove this IC session record. This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIcDeleteOpen(false); setIcDeleteId(null); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteIcSession} disabled={deleteIcSession.isPending} className="rounded-sm font-mono uppercase text-[10px]">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Meeting Notes Modal */}
      <AiMeetingNotesModal
        targetId={targetId}
        targetName={target?.projectName ?? ""}
        isOpen={aiNotesOpen}
        onClose={() => setAiNotesOpen(false)}
        onApplied={() => {
          invalidateInteractions();
          invalidateActions();
          invalidateHistory();
          invalidateTarget();
        }}
      />
    </div>
  );
}

// ── Progressive Overview Sections ────────────────────────────────────────────

type OverviewTarget = {
  currentStage?: string | null;
  projectName?: string | null;
  targetCode?: string | null;
  legalName?: string | null;
  sector?: string | null;
  subsector?: string | null;
  country?: string | null;
  geographyRegion?: string | null;
  dealOwner?: string | null;
  dealChampion?: string | null;
  executiveSponsor?: string | null;
  priorityTier?: string | null;
  strategicRationale?: string | null;
  businessUnit?: string | null;
  createdAt?: string | null;
  priorityScore: number;
  strategicFitScore?: number | null;
  synergyScore?: number | null;
  financialAttractivenessScore?: number | null;
  processMaturityScore?: number | null;
  riskPenaltyScore?: number | null;
  sourcingChannel?: string | null;
  dealType?: string | null;
};

type OverviewAction = {
  id: number;
  description: string;
  status: string;
  dueDate?: string | null;
  owner?: string | null;
};

const SCREENING_STAGE = "NDA / CIM";
const DILIGENCE_STAGE = "Preliminary Due Diligence";
const OFFER_STAGE = "Binding Offer";

function stageReached(current: string | null | undefined, gate: string): boolean {
  const currentIdx = ALL_KNOWN_STAGES.indexOf(current ?? "");
  const gateIdx = ALL_KNOWN_STAGES.indexOf(gate);
  if (currentIdx < 0 || gateIdx < 0) return false;
  return currentIdx >= gateIdx;
}

function OverviewSectionHeader({
  label,
  badge,
  always,
}: {
  label: string;
  badge?: React.ReactNode;
  always?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 font-semibold">{label}</div>
      {always && (
        <div className="text-[9px] font-mono uppercase tracking-wide text-muted-foreground/40 border border-border/30 px-1.5 py-0.5 rounded">Always</div>
      )}
      {badge}
    </div>
  );
}

function ConfidenceBadge({ stage }: { stage: string | null | undefined }) {
  const level = getScoreConfidence(stage);
  const cls =
    level === "Diligence-backed"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25"
      : level === "Under review"
      ? "bg-primary/10 text-primary border-primary/25"
      : "bg-muted/50 text-muted-foreground border-border/50";
  return (
    <Badge variant="outline" className={`font-mono text-[9px] uppercase ${cls}`}>
      {level}
    </Badge>
  );
}

function ScoreRow({
  label,
  value,
  field,
  stage,
  isRisk,
  showConfidence,
}: {
  label: string;
  value: number | null | undefined;
  field: ScoreField;
  stage: string | null | undefined;
  isRisk?: boolean;
  showConfidence?: boolean;
}) {
  const display = formatScore(value, field, stage);
  const isAssessed = display !== "Not assessed";
  const confidence = getScoreConfidence(stage);
  const confidenceCls =
    confidence === "Diligence-backed"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25"
      : confidence === "Under review"
      ? "bg-primary/10 text-primary border-primary/25"
      : "bg-muted/50 text-muted-foreground/60 border-border/40";

  return (
    <div
      className={`p-3 flex items-center justify-between text-sm gap-2 ${
        isRisk ? "bg-destructive/5" : ""
      }`}
    >
      <span className={isRisk ? "text-destructive" : "text-muted-foreground"}>{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        {showConfidence && (
          <span className={`font-mono text-[8px] uppercase tracking-wide border px-1.5 py-0.5 rounded ${confidenceCls}`}>
            {confidence}
          </span>
        )}
        {isAssessed ? (
          <span className={`font-mono font-medium ${isRisk ? "text-destructive" : ""}`}>
            {isRisk ? `-${display}` : `${display}/100`}
          </span>
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground/50 italic">Not assessed</span>
        )}
      </div>
    </div>
  );
}

function OverviewSections({
  target,
  actions,
}: {
  target: OverviewTarget;
  actions: OverviewAction[];
}) {
  const stage = target.currentStage;
  const showScreening = stageReached(stage, SCREENING_STAGE);
  const showDiligence = stageReached(stage, DILIGENCE_STAGE);
  const showOffer = stageReached(stage, OFFER_STAGE);

  const nextAction = actions.find((a) => a.status !== "Completed");
  const assessedCount = countAssessedScores({
    strategicFitScore: target.strategicFitScore,
    synergyScore: target.synergyScore,
    financialAttractivenessScore: target.financialAttractivenessScore,
    processMaturityScore: target.processMaturityScore,
    riskPenaltyScore: target.riskPenaltyScore,
    currentStage: stage,
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-500";
    if (score >= 60) return "text-primary";
    if (score >= 40) return "text-amber-500";
    return "text-destructive";
  };

  return (
    <div className="space-y-6">
      {/* ── Section 1: Teaser / Origination Snapshot (always visible) ── */}
      <div className="space-y-2">
        <OverviewSectionHeader label="Teaser / Origination Snapshot" always />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2 bg-card/40 border-border/70 rounded-xl">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Strategic Rationale</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {target.strategicRationale ? (
                  <LinkifiedText text={target.strategicRationale} />
                ) : (
                  <span className="text-muted-foreground italic">No strategic rationale recorded.</span>
                )}
              </p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="bg-card/40 border-border/70 rounded-xl">
              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-1 gap-y-3">
                  {[
                    { label: "Project Name", value: target.projectName },
                    { label: "Target Code", value: target.targetCode },
                    { label: "Legal Name", value: target.legalName },
                    { label: "Deal Type", value: target.dealType },
                    { label: "Sector", value: [target.sector, target.subsector].filter(Boolean).join(" › ") || null },
                    { label: "Geography", value: [target.country, target.geographyRegion].filter(Boolean).join(" / ") || null },
                    { label: "Sourcing Channel", value: target.sourcingChannel },
                    { label: "Priority Tier", value: target.priorityTier },
                    { label: "Deal Owner", value: target.dealOwner },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider mb-0.5">{label}</div>
                      <div className="text-sm font-medium">{value || "—"}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {nextAction && (
              <Card className="bg-primary/5 border-primary/20 rounded-xl">
                <CardContent className="pt-3 pb-3 px-4">
                  <div className="text-[9px] font-mono text-primary/70 uppercase tracking-wider mb-1">Next Action</div>
                  <div className="text-sm font-medium leading-snug truncate">{nextAction.description}</div>
                  {nextAction.dueDate && (
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      Due {format(parseISO(nextAction.dueDate), "MMM d, yyyy")}
                    </div>
                  )}
                  {nextAction.owner && (
                    <div className="text-[10px] font-mono text-muted-foreground">{nextAction.owner}</div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 2: Screening View (NDA / CIM onward) ── */}
      {showScreening && (
        <div className="space-y-2">
          <OverviewSectionHeader label="Screening View" />
          <Card className="bg-card/40 border-border/70 rounded-xl">
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                {[
                  { label: "Deal Champion", value: target.dealChampion },
                  { label: "Exec Sponsor", value: target.executiveSponsor },
                  { label: "Business Unit", value: target.businessUnit },
                  { label: "Added", value: target.createdAt ? format(parseISO(target.createdAt), "yyyy-MM-dd") : null },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">{label}</div>
                    <div className="text-sm font-medium">{value || "—"}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Section 3: Diligence Assessment (Non-Binding Offer onward) ── */}
      {showDiligence && (
        <div className="space-y-2">
          <OverviewSectionHeader
            label="Diligence Assessment"
            badge={<ConfidenceBadge stage={stage} />}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/40 border-border/70 rounded-xl overflow-hidden md:col-span-2">
              <div className="bg-muted/40 p-4 border-b border-border/60 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Composite Score</div>
                  <div className="flex items-center gap-2">
                    <ConfidenceBadge stage={stage} />
                    <span className="text-[10px] font-mono text-muted-foreground/60">
                      {assessedCount}/5 scores assessed
                    </span>
                  </div>
                </div>
                <div className={`text-3xl font-mono font-bold ${getScoreColor(target.priorityScore)}`}>
                  {Math.round(target.priorityScore)}
                </div>
              </div>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  <ScoreRow
                    label="Strategic Fit"
                    value={target.strategicFitScore}
                    field="strategicFitScore"
                    stage={stage}
                    showConfidence
                  />
                  <ScoreRow
                    label="Synergy Potential"
                    value={target.synergyScore}
                    field="synergyScore"
                    stage={stage}
                    showConfidence
                  />
                  <ScoreRow
                    label="Financial Attractiveness"
                    value={target.financialAttractivenessScore}
                    field="financialAttractivenessScore"
                    stage={stage}
                    showConfidence
                  />
                  <ScoreRow
                    label="Process Maturity"
                    value={target.processMaturityScore}
                    field="processMaturityScore"
                    stage={stage}
                    showConfidence
                  />
                  <ScoreRow
                    label="Risk Penalty"
                    value={target.riskPenaltyScore}
                    field="riskPenaltyScore"
                    stage={stage}
                    isRisk
                    showConfidence
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/40 border-border/70 rounded-xl flex flex-col justify-center">
              <CardContent className="pt-6 pb-6 flex flex-col items-center justify-center gap-2 text-center">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Assessment Completeness</div>
                <div className={`text-4xl font-bold font-mono ${assessedCount === 5 ? "text-emerald-500" : assessedCount >= 3 ? "text-primary" : "text-muted-foreground"}`}>
                  {assessedCount}/5
                </div>
                <div className="w-full bg-muted/40 rounded-full h-1.5 mt-1">
                  <div
                    className={`h-1.5 rounded-full transition-all ${assessedCount === 5 ? "bg-emerald-500" : "bg-primary"}`}
                    style={{ width: `${(assessedCount / 5) * 100}%` }}
                  />
                </div>
                <div className="text-[10px] font-mono text-muted-foreground/60">
                  {assessedCount === 5
                    ? "All scores assessed"
                    : assessedCount === 0
                    ? "No scores assessed yet"
                    : `${5 - assessedCount} score${5 - assessedCount > 1 ? "s" : ""} pending`}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Section 4: Offer / Integration Readiness (Binding Offer onward) ── */}
      {showOffer && (
        <div className="space-y-2">
          <OverviewSectionHeader label="Offer / Integration Readiness" />
          <Card className="bg-card/40 border-border/70 rounded-xl">
            <CardContent className="pt-4 pb-4">
              <p className="text-[11px] font-mono text-muted-foreground/70">
                Deal has progressed to offer stage. Document key offer and integration milestones in the
                Diligence tab and track actions below.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scores section for early-stage targets (collapsed, in lieu of Diligence section) */}
      {!showDiligence && (
        <div className="space-y-2">
          <OverviewSectionHeader label="Score Card (Early Stage)" />
          <Collapsible>
            <Card className="bg-card/40 border-border/70 rounded-xl overflow-hidden">
              <CollapsibleTrigger asChild>
                <div className="bg-muted/30 px-4 py-3 border-b border-border/60 flex items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Score Card</div>
                    <ConfidenceBadge stage={stage} />
                    <span className="text-[10px] font-mono text-muted-foreground/50">{assessedCount}/5 assessed</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-2xl font-mono font-bold ${getScoreColor(target.priorityScore)}`}>
                      {Math.round(target.priorityScore)}
                    </div>
                    <ChevronDown size={14} className="text-muted-foreground" />
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    <ScoreRow label="Strategic Fit" value={target.strategicFitScore} field="strategicFitScore" stage={stage} showConfidence />
                    <ScoreRow label="Synergy Potential" value={target.synergyScore} field="synergyScore" stage={stage} showConfidence />
                    <ScoreRow label="Financial Attractiveness" value={target.financialAttractivenessScore} field="financialAttractivenessScore" stage={stage} showConfidence />
                    <ScoreRow label="Process Maturity" value={target.processMaturityScore} field="processMaturityScore" stage={stage} showConfidence />
                    <ScoreRow label="Risk Penalty" value={target.riskPenaltyScore} field="riskPenaltyScore" stage={stage} isRisk showConfidence />
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

type ActionRowProps = {
  action: {
    id: number;
    description: string;
    owner?: string | null;
    dueDate?: string | null;
    priority: string;
    status: string;
  };
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  isPending: boolean;
};

function ActionRow({ action, onEdit, onToggle, onDelete, isPending }: ActionRowProps) {
  const isCompleted = action.status === "Completed";
  const isOverdue =
    !isCompleted && action.dueDate && new Date(action.dueDate) < new Date(new Date().toDateString());

  return (
    <div className="flex items-start gap-3 p-3 border border-border rounded-sm bg-card/20 group hover:bg-card/40 transition-colors">
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium leading-snug ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
          <LinkifiedText text={action.description} />
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className={`text-[10px] font-mono uppercase ${
            action.status === "In Progress" ? "text-primary" :
            action.status === "Blocked" ? "text-destructive" :
            action.status === "Completed" ? "text-emerald-500" : "text-muted-foreground"
          }`}>{action.status}</span>
          <span className={`text-[10px] font-mono uppercase ${
            action.priority === "Critical" ? "text-destructive" :
            action.priority === "High" ? "text-amber-500" : "text-muted-foreground"
          }`}>{action.priority}</span>
          {action.owner && <span className="text-[10px] font-mono text-muted-foreground">{action.owner}</span>}
          {action.dueDate && (
            <span className={`text-[10px] font-mono ${isOverdue ? "text-destructive font-bold" : "text-muted-foreground"}`}>
              {isOverdue ? "⚠ " : ""}Due {format(parseISO(action.dueDate), "MMM d")}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          onClick={onEdit}
          title="Edit"
        >
          <Pencil size={12} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive/60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 size={12} />
        </Button>
        {isCompleted ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] font-mono uppercase rounded-sm border-border text-muted-foreground"
            onClick={onToggle}
            disabled={isPending}
          >
            <RotateCcw size={11} className="mr-1" /> Reopen
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 text-[10px] font-mono uppercase rounded-sm bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={onToggle}
            disabled={isPending}
          >
            <CheckCircle2 size={11} className="mr-1" /> Complete
          </Button>
        )}
      </div>
    </div>
  );
}
