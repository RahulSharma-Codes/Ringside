import React, { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetTarget, getGetTargetQueryKey,
  useUpdateTargetStage,
  useListInteractions, getListInteractionsQueryKey,
  useCreateInteraction,
  useUpdateInteraction,
  useListActions, getListActionsQueryKey,
  useCreateAction,
  useUpdateAction,
  useGetStageHistory, getGetStageHistoryQueryKey,
  useDeleteTarget,
  useUpdateTarget,
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
  LayoutGrid,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

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

  const updateStage = useUpdateTargetStage();
  const createInteraction = useCreateInteraction();
  const updateInteraction = useUpdateInteraction();
  const createAction = useCreateAction();
  const updateAction = useUpdateAction();
  const updateTarget = useUpdateTarget();
  const deleteTarget = useDeleteTarget();

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
    if (stage === "Closed") return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    if (stage === "Dropped") return "bg-destructive/10 text-destructive border-destructive/20";
    if (stage === "On Hold") return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    return "bg-primary/10 text-primary border-primary/20";
  };

  const openActions = (actions ?? []).filter((a) => a.status !== "Completed");
  const completedActions = (actions ?? []).filter((a) => a.status === "Completed");

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">

      {/* Header */}
      <div className="border-b border-border bg-sidebar/50 backdrop-blur-sm p-4 md:p-6 shrink-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/pipeline">
                <Button variant="ghost" size="icon" className="rounded-sm h-8 w-8 text-muted-foreground hover:text-foreground shrink-0">
                  <ArrowLeft size={16} />
                </Button>
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-bold font-mono tracking-tight truncate">{target.projectName}</h1>
                  {target.isConfidential && (
                    <Badge variant="outline" className="font-mono text-[10px] uppercase bg-amber-500/10 text-amber-500 border-amber-500/20 shrink-0">
                      <ShieldAlert size={10} className="mr-1" /> Confidential
                    </Badge>
                  )}
                </div>
                <div className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-2 mt-1 flex-wrap">
                  <span>{target.targetCode}</span>
                  <span className="w-1 h-1 bg-border rounded-full" />
                  <span>{target.sector || "Uncategorized"}</span>
                  <span className="w-1 h-1 bg-border rounded-full" />
                  <span className="text-primary font-bold">{target.priorityTier}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button size="icon" variant="outline" className="rounded-sm border-border text-muted-foreground h-9 w-9" onClick={() => setEditOpen(true)}>
                <Edit size={14} />
              </Button>
              <Button size="icon" variant="outline" className="rounded-sm border-border text-destructive hover:bg-destructive/10 h-9 w-9" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={14} />
              </Button>
              <div className="hidden md:flex items-center gap-3 border-l border-border pl-3">
                <div className="text-right">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Stage</div>
                  <div className="font-medium text-sm">{target.currentStage}</div>
                </div>
                <Button size="sm" className="rounded-sm font-mono uppercase text-[11px] gap-1.5 tracking-wider h-9" onClick={() => setStageOpen(true)}>
                  <TargetIcon size={13} /> Change Stage
                </Button>
              </div>
            </div>
          </div>
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
            <TabsContent value="overview" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 md:col-span-2 bg-card/30 border-border rounded-sm">
                  <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Strategic Thesis</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {target.strategicRationale
                        ? <LinkifiedText text={target.strategicRationale} />
                        : <span className="text-muted-foreground italic">No strategic rationale recorded.</span>
                      }
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card/30 border-border rounded-sm overflow-hidden">
                  <div className="bg-muted/50 p-4 border-b border-border flex items-center justify-between">
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Priority Score</div>
                    <div className={`text-3xl font-mono font-bold ${getScoreColor(target.priorityScore)}`}>
                      {Math.round(target.priorityScore)}
                    </div>
                  </div>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {[
                        { label: "Strategic Fit", value: target.strategicFitScore },
                        { label: "Synergy Potential", value: target.synergyScore },
                        { label: "Financials", value: target.financialAttractivenessScore },
                        { label: "Maturity", value: target.processMaturityScore },
                      ].map(({ label, value }) => (
                        <div key={label} className="p-3 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono font-medium">{value}/100</span>
                        </div>
                      ))}
                      <div className="p-3 flex items-center justify-between text-sm bg-destructive/5 text-destructive">
                        <span>Risk Penalty</span>
                        <span className="font-mono font-medium">-{target.riskPenaltyScore}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="col-span-1 md:col-span-3 bg-card/30 border-border rounded-sm">
                  <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Entity Details</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                      {[
                        { label: "Legal Name", value: target.legalName },
                        { label: "Geography", value: [target.country, target.geographyRegion].filter(Boolean).join(" / ") || null },
                        { label: "Sector", value: [target.sector, target.subsector].filter(Boolean).join(" › ") || null },
                        { label: "Business Unit", value: target.businessUnit },
                        { label: "Deal Owner", value: target.dealOwner },
                        { label: "Deal Champion", value: target.dealChampion },
                        { label: "Exec Sponsor", value: target.executiveSponsor },
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
            </TabsContent>

            {/* Interactions */}
            <TabsContent value="interactions" className="space-y-4 mt-0">
              <div className="flex justify-end">
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
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0" onClick={() => openEditInteraction(inter)}>
                            <Pencil size={12} />
                          </Button>
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
                          <ActionRow key={action.id} action={action} onEdit={() => openEditAction(action)} onToggle={() => handleToggleActionComplete(action.id, action.status)} isPending={updateAction.isPending} />
                        ))}
                      </div>
                    </div>
                  )}
                  {completedActions.length > 0 && (
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Completed ({completedActions.length})</div>
                      <div className="space-y-2 opacity-60">
                        {completedActions.map((action) => (
                          <ActionRow key={action.id} action={action} onEdit={() => openEditAction(action)} onToggle={() => handleToggleActionComplete(action.id, action.status)} isPending={updateAction.isPending} />
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
                              <Badge variant="outline" className={`font-mono text-[10px] rounded-sm ${getStageBadgeClass(entry.previousStage)}`}>{entry.previousStage}</Badge>
                              <span className="text-muted-foreground text-xs">→</span>
                            </>
                          )}
                          <Badge variant="outline" className={`font-mono text-[10px] rounded-sm ${getStageBadgeClass(entry.newStage)}`}>{entry.newStage}</Badge>
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
          </Tabs>
        </div>
      </div>

      {/* Mobile sticky bottom bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar/95 backdrop-blur-sm p-3 flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase border-border" onClick={() => setInteractionOpen(true)}>
          <MessageSquare size={13} className="mr-1" /> Log
        </Button>
        <Button variant="outline" size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase border-border" onClick={() => setActionOpen(true)}>
          <Plus size={13} className="mr-1" /> Action
        </Button>
        <Button size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase" onClick={() => setStageOpen(true)}>
          <TargetIcon size={13} className="mr-1" /> Stage
        </Button>
      </div>

      {/* ══ MODALS ══ */}

      {/* Change Stage */}
      <Dialog open={stageOpen} onOpenChange={setStageOpen}>
        <DialogContent className="sm:max-w-[425px] border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Change Pipeline Stage</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Current Stage</div>
              <div className="text-sm font-medium font-mono">{target.currentStage}</div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">New Stage <span className="text-destructive">*</span></label>
              <Select value={stageVal} onValueChange={setStageVal}>
                <SelectTrigger className="rounded-sm bg-background/50">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent className="rounded-sm">
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s} disabled={s === target.currentStage}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Rationale / Notes <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={stageReason}
                onChange={(e) => setStageReason(e.target.value)}
                className="rounded-sm bg-background/50 resize-none h-20"
                placeholder="Required — explain the reason for this stage change"
              />
              {stageVal && !stageReason.trim() && (
                <p className="text-[10px] text-destructive font-mono">A reason is required to change stage.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStageOpen(false); setStageVal(""); setStageReason(""); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <Button onClick={handleUpdateStage} disabled={!stageVal || !stageReason.trim() || updateStage.isPending} className="rounded-sm font-mono uppercase text-[10px]">
              Confirm Move
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
  isPending: boolean;
};

function ActionRow({ action, onEdit, onToggle, isPending }: ActionRowProps) {
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
