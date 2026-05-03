import React, { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { 
  useGetTarget, getGetTargetQueryKey,
  useUpdateTargetStage,
  useListInteractions, getListInteractionsQueryKey,
  useCreateInteraction,
  useListActions, getListActionsQueryKey,
  useCreateAction,
  useGetStageHistory, getGetStageHistoryQueryKey,
  useDeleteTarget,
  useUpdateTarget
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Target as TargetIcon, Activity, Plus, ShieldAlert, Edit, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const STAGES = [
  "Sourcing", "Outreach", "Introductory Discussion", "NDA / CIM", 
  "Preliminary Due Diligence", "Management Meeting", "Non-Binding Offer", 
  "Confirmatory Due Diligence", "Binding Offer", "SPA Negotiation", 
  "Integration Planning", "Closed", "On Hold", "Dropped"
];

export default function TargetDetail() {
  const { id } = useParams();
  const targetId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  // Dialog states
  const [stageOpen, setStageOpen] = useState(false);
  const [stageVal, setStageVal] = useState("");
  const [stageReason, setStageReason] = useState("");
  
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interType, setInterType] = useState("Meeting");
  const [interSummary, setInterSummary] = useState("");

  const [actionOpen, setActionOpen] = useState(false);
  const [actionDesc, setActionDesc] = useState("");
  const [actionPriority, setActionPriority] = useState("Medium");

  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<{ projectName: string; targetCode: string; priorityTier: string }>({ projectName: "", targetCode: "", priorityTier: "" });

  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: target, isLoading: loadingTarget } = useGetTarget(targetId, {
    query: { enabled: !!targetId, queryKey: getGetTargetQueryKey(targetId) }
  });

  const { data: interactions, isLoading: loadingInteractions } = useListInteractions(targetId, {
    query: { enabled: !!targetId, queryKey: getListInteractionsQueryKey(targetId) }
  });

  const { data: actions, isLoading: loadingActions } = useListActions(targetId, {
    query: { enabled: !!targetId, queryKey: getListActionsQueryKey(targetId) }
  });

  const { data: history, isLoading: loadingHistory } = useGetStageHistory(targetId, {
    query: { enabled: !!targetId, queryKey: getGetStageHistoryQueryKey(targetId) }
  });

  const updateStage = useUpdateTargetStage();
  const createInteraction = useCreateInteraction();
  const createAction = useCreateAction();
  const updateTarget = useUpdateTarget();
  const deleteTarget = useDeleteTarget();

  useEffect(() => {
    if (target) {
      setEditData({
        projectName: target.projectName,
        targetCode: target.targetCode,
        priorityTier: target.priorityTier,
      });
    }
  }, [target]);

  const handleUpdateStage = () => {
    if (!stageVal) return;
    updateStage.mutate({ 
      id: targetId, 
      data: { newStage: stageVal, changeReason: stageReason } 
    }, {
      onSuccess: () => {
        toast({ title: "Stage Updated", description: `Target moved to ${stageVal}` });
        setStageOpen(false);
        setStageVal("");
        setStageReason("");
        queryClient.invalidateQueries({ queryKey: getGetTargetQueryKey(targetId) });
        queryClient.invalidateQueries({ queryKey: getGetStageHistoryQueryKey(targetId) });
      }
    });
  };

  const handleCreateInteraction = () => {
    if (!interSummary) return;
    createInteraction.mutate({
      id: targetId,
      data: { interactionType: interType, summary: interSummary }
    }, {
      onSuccess: () => {
        toast({ title: "Log Recorded" });
        setInteractionOpen(false);
        setInterSummary("");
        queryClient.invalidateQueries({ queryKey: getListInteractionsQueryKey(targetId) });
      }
    });
  };

  const handleCreateAction = () => {
    if (!actionDesc) return;
    createAction.mutate({
      id: targetId,
      data: { description: actionDesc, priority: actionPriority }
    }, {
      onSuccess: () => {
        toast({ title: "Action Item Added" });
        setActionOpen(false);
        setActionDesc("");
        queryClient.invalidateQueries({ queryKey: getListActionsQueryKey(targetId) });
      }
    });
  };

  const handleUpdateTarget = () => {
    updateTarget.mutate({
      id: targetId,
      data: {
        projectName: editData.projectName,
        priorityTier: editData.priorityTier,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Target Updated" });
        setEditOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetTargetQueryKey(targetId) });
      }
    });
  };

  const handleDeleteTarget = () => {
    deleteTarget.mutate({ id: targetId }, {
      onSuccess: () => {
        toast({ title: "Target Deleted" });
        setLocation("/pipeline");
      }
    });
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

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">
      <div className="border-b border-border bg-sidebar/50 backdrop-blur-sm p-6 shrink-0">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/pipeline">
                <Button variant="ghost" size="icon" className="rounded-sm h-8 w-8 text-muted-foreground hover:text-foreground">
                  <ArrowLeft size={16} />
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold font-mono tracking-tight">{target.projectName}</h1>
                  {target.isConfidential && (
                    <Badge variant="outline" className="font-mono text-[10px] uppercase bg-amber-500/10 text-amber-500 border-amber-500/20">
                      <ShieldAlert size={10} className="mr-1" /> Confidential
                    </Badge>
                  )}
                </div>
                <div className="text-sm font-mono text-muted-foreground uppercase flex items-center gap-2 mt-1">
                  <span>{target.targetCode}</span>
                  <span className="w-1 h-1 bg-border rounded-full" />
                  <span>{target.sector || "Uncategorized"}</span>
                  <span className="w-1 h-1 bg-border rounded-full" />
                  <span className="text-primary font-bold">{target.priorityTier}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="outline" className="rounded-sm border-border text-muted-foreground h-9 w-9">
                    <Edit size={14} />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] border-border bg-sidebar rounded-sm">
                  <DialogHeader>
                    <DialogTitle className="font-mono uppercase tracking-tight text-lg">Edit Target</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Project Name</label>
                      <Input 
                        value={editData.projectName}
                        onChange={(e) => setEditData({...editData, projectName: e.target.value})}
                        className="rounded-sm bg-background/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Priority Tier</label>
                      <Select value={editData.priorityTier} onValueChange={(val) => setEditData({...editData, priorityTier: val})}>
                        <SelectTrigger className="rounded-sm bg-background/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          <SelectItem value="Must-Win">Must-Win</SelectItem>
                          <SelectItem value="Priority 1">Priority 1</SelectItem>
                          <SelectItem value="Priority 2">Priority 2</SelectItem>
                          <SelectItem value="Watchlist">Watchlist</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
                    <Button onClick={handleUpdateTarget} disabled={updateTarget.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="outline" className="rounded-sm border-border text-destructive hover:bg-destructive/10 h-9 w-9">
                    <Trash2 size={14} />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] border-destructive bg-sidebar rounded-sm">
                  <DialogHeader>
                    <DialogTitle className="font-mono uppercase tracking-tight text-lg text-destructive">Delete Target</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <p className="text-sm text-muted-foreground">Are you sure you want to delete this target? This action cannot be undone.</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
                    <Button variant="destructive" onClick={handleDeleteTarget} disabled={deleteTarget.isPending} className="rounded-sm font-mono uppercase text-[10px]">Delete</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="text-right mx-4 hidden sm:block border-l border-border pl-4">
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Current Stage</div>
                <div className="font-medium text-sm">{target.currentStage}</div>
              </div>
              
              <Dialog open={stageOpen} onOpenChange={setStageOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-sm font-mono uppercase text-[11px] gap-2 tracking-wider h-9">
                    <TargetIcon size={14} /> Update Stage
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] border-border bg-sidebar rounded-sm">
                  <DialogHeader>
                    <DialogTitle className="font-mono uppercase tracking-tight text-lg">Advance Pipeline Stage</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">New Stage</label>
                      <Select value={stageVal} onValueChange={setStageVal}>
                        <SelectTrigger className="rounded-sm bg-background/50">
                          <SelectValue placeholder="Select target stage" />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          {STAGES.map(s => (
                            <SelectItem key={s} value={s} disabled={s === target.currentStage}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Rationale / Notes (Optional)</label>
                      <Textarea 
                        value={stageReason}
                        onChange={(e) => setStageReason(e.target.value)}
                        className="rounded-sm bg-background/50 resize-none h-20"
                        placeholder="Why is this moving forward or being dropped?"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setStageOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
                    <Button onClick={handleUpdateStage} disabled={!stageVal || updateStage.isPending} className="rounded-sm font-mono uppercase text-[10px]">Confirm Move</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-background">
        <div className="max-w-6xl mx-auto p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none p-0 h-auto mb-6">
              <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 font-mono text-xs uppercase tracking-wider">Overview</TabsTrigger>
              <TabsTrigger value="interactions" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 font-mono text-xs uppercase tracking-wider">Log</TabsTrigger>
              <TabsTrigger value="actions" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 font-mono text-xs uppercase tracking-wider">Action Items</TabsTrigger>
              <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 font-mono text-xs uppercase tracking-wider">Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 md:col-span-2 bg-card/30 border-border rounded-sm">
                  <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Strategic Thesis</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {target.strategicRationale || "No strategic rationale recorded."}
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
                      <div className="p-3 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Strategic Fit</span>
                        <span className="font-mono font-medium">{target.strategicFitScore}/100</span>
                      </div>
                      <div className="p-3 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Synergy Potential</span>
                        <span className="font-mono font-medium">{target.synergyScore}/100</span>
                      </div>
                      <div className="p-3 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Financials</span>
                        <span className="font-mono font-medium">{target.financialAttractivenessScore}/100</span>
                      </div>
                      <div className="p-3 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Maturity</span>
                        <span className="font-mono font-medium">{target.processMaturityScore}/100</span>
                      </div>
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Legal Name</div>
                        <div className="text-sm font-medium">{target.legalName || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Geography</div>
                        <div className="text-sm font-medium">{target.country || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Deal Owner</div>
                        <div className="text-sm font-medium">{target.dealOwner || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase mb-1">Added</div>
                        <div className="text-sm font-mono">{format(parseISO(target.createdAt), 'yyyy-MM-dd')}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="interactions" className="space-y-4 mt-0">
              <div className="flex justify-end mb-4">
                <Dialog open={interactionOpen} onOpenChange={setInteractionOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="rounded-sm font-mono text-[10px] uppercase border-border">
                      <Plus size={14} className="mr-1" /> Log Interaction
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px] border-border bg-sidebar rounded-sm">
                    <DialogHeader>
                      <DialogTitle className="font-mono uppercase tracking-tight text-lg">Record Deal Activity</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Type</label>
                        <Select value={interType} onValueChange={setInterType}>
                          <SelectTrigger className="rounded-sm bg-background/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-sm">
                            <SelectItem value="Meeting">Meeting</SelectItem>
                            <SelectItem value="Call">Call</SelectItem>
                            <SelectItem value="Email">Email</SelectItem>
                            <SelectItem value="Material Received">Material Received</SelectItem>
                            <SelectItem value="Internal Review">Internal Review</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Summary</label>
                        <Textarea 
                          value={interSummary}
                          onChange={(e) => setInterSummary(e.target.value)}
                          className="rounded-sm bg-background/50 resize-none h-24"
                          placeholder="Key takeaways..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setInteractionOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
                      <Button onClick={handleCreateInteraction} disabled={!interSummary || createInteraction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save Log</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {loadingInteractions ? (
                <Skeleton className="h-32 w-full" />
              ) : interactions?.length === 0 ? (
                <div className="border border-border border-dashed rounded-sm p-8 text-center bg-card/10">
                  <div className="text-muted-foreground text-sm font-mono uppercase tracking-widest">No interactions logged</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {interactions?.map((log) => (
                    <Card key={log.id} className="bg-card/30 border-border rounded-sm">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-mono text-[10px] uppercase rounded-sm bg-muted text-muted-foreground">
                              {log.interactionType}
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono">
                              {format(parseISO(log.interactionDatetime), 'yyyy-MM-dd HH:mm')}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{log.summary}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="actions" className="space-y-4 mt-0">
              <div className="flex justify-end mb-4">
                <Dialog open={actionOpen} onOpenChange={setActionOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="rounded-sm font-mono text-[10px] uppercase border-border">
                      <Plus size={14} className="mr-1" /> Add Action
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px] border-border bg-sidebar rounded-sm">
                    <DialogHeader>
                      <DialogTitle className="font-mono uppercase tracking-tight text-lg">New Action Item</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Description</label>
                        <Input 
                          value={actionDesc}
                          onChange={(e) => setActionDesc(e.target.value)}
                          className="rounded-sm bg-background/50"
                          placeholder="What needs to be done?"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Priority</label>
                        <Select value={actionPriority} onValueChange={setActionPriority}>
                          <SelectTrigger className="rounded-sm bg-background/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-sm">
                            <SelectItem value="Critical">Critical</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="Low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setActionOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
                      <Button onClick={handleCreateAction} disabled={!actionDesc || createAction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Create</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {loadingActions ? (
                <Skeleton className="h-32 w-full" />
              ) : actions?.length === 0 ? (
                <div className="border border-border border-dashed rounded-sm p-8 text-center bg-card/10">
                  <div className="text-muted-foreground text-sm font-mono uppercase tracking-widest">No action items</div>
                </div>
              ) : (
                <div className="grid gap-3">
                  {actions?.map((action) => (
                    <div key={action.id} className="flex items-center justify-between p-4 border border-border bg-card/30 rounded-sm">
                      <div>
                        <div className="font-medium text-sm">{action.description}</div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`text-[10px] font-mono uppercase ${
                            action.priority === 'Critical' ? 'text-destructive font-bold' : 
                            action.priority === 'High' ? 'text-amber-500' : 'text-muted-foreground'
                          }`}>
                            {action.priority}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">
                            STATUS: {action.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-0">
              {loadingHistory ? (
                <Skeleton className="h-64 w-full" />
              ) : history?.length === 0 ? (
                <div className="border border-border border-dashed rounded-sm p-8 text-center bg-card/10">
                  <div className="text-muted-foreground text-sm font-mono uppercase tracking-widest">No stage history available</div>
                </div>
              ) : (
                <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  {history?.map((entry) => (
                    <div key={entry.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        <Activity size={14} />
                      </div>
                      
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-sm border border-border bg-card/50 backdrop-blur shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-mono text-xs font-bold text-primary uppercase">{entry.newStage}</div>
                          <time className="font-mono text-[10px] text-muted-foreground">{format(parseISO(entry.changedAt), 'yyyy-MM-dd')}</time>
                        </div>
                        {entry.previousStage && (
                          <div className="text-[10px] text-muted-foreground font-mono uppercase">
                            Moved from {entry.previousStage}
                          </div>
                        )}
                        {entry.changeReason && (
                          <div className="mt-2 text-sm text-muted-foreground border-t border-border/50 pt-2">
                            {entry.changeReason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

          </Tabs>
        </div>
      </div>
    </div>
  );
}
