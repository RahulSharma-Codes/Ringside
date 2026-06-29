import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInteractions, getListInteractionsQueryKey,
  useCreateInteraction,
  useUpdateInteraction,
  useDeleteInteraction,
  getListActionsQueryKey,
  getGetStageHistoryQueryKey,
  getGetTargetQueryKey,
} from "@workspace/api-client-react";
import { LinkifiedText } from "@/components/linkified-text";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, MessageSquare, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import { AiMeetingNotesModal } from "@/components/ai-meeting-notes-modal";

const INTERACTION_TYPES = ["Meeting", "Call", "Email", "Material Received", "Internal Review", "Site Visit", "Other"];
const SENTIMENTS = ["Positive", "Neutral", "Negative"];

type EditInterData = {
  id: number;
  interactionType: string;
  summary: string;
  participantsInternal: string;
  participantsExternal: string;
  sentiment: string;
  valuationSignal: string;
};

interface InteractionsTabProps {
  targetId: number;
  addOpen: boolean;
  onAddOpenChange: (v: boolean) => void;
}

export function InteractionsTab({ targetId, addOpen, onAddOpenChange }: InteractionsTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: interactions, isLoading: loadingInteractions } = useListInteractions(targetId, {
    query: { enabled: !!targetId, queryKey: getListInteractionsQueryKey(targetId) },
  });

  const createInteraction = useCreateInteraction();
  const updateInteraction = useUpdateInteraction();
  const deleteInteraction = useDeleteInteraction();

  const invalidateInteractions = () => qc.invalidateQueries({ queryKey: getListInteractionsQueryKey(targetId) });

  // Add form state
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interType, setInterType] = useState("Meeting");
  const [interSummary, setInterSummary] = useState("");
  const [interParticipantsInternal, setInterParticipantsInternal] = useState("");
  const [interParticipantsExternal, setInterParticipantsExternal] = useState("");
  const [interSentiment, setInterSentiment] = useState("__none__");
  const [interValuationSignal, setInterValuationSignal] = useState("");

  // Edit form state
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

  // Delete state
  const [deleteInterOpen, setDeleteInterOpen] = useState(false);
  const [deleteInterId, setDeleteInterId] = useState<number | null>(null);

  // AI notes modal
  const [aiNotesOpen, setAiNotesOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("ai") === "meeting-notes";
  });

  // Bridge: parent mobile bar can trigger add dialog
  useEffect(() => {
    if (addOpen) {
      setInteractionOpen(true);
      onAddOpenChange(false);
    }
  }, [addOpen, onAddOpenChange]);

  const resetInterForm = () => {
    setInterType("Meeting");
    setInterSummary("");
    setInterParticipantsInternal("");
    setInterParticipantsExternal("");
    setInterSentiment("__none__");
    setInterValuationSignal("");
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

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex rounded-sm font-mono text-[10px] uppercase border-primary/30 text-primary hover:bg-primary/5 gap-1"
            onClick={() => setAiNotesOpen(true)}
          >
            <Sparkles size={11} /><span className="hidden sm:inline">Parse Notes with AI</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="hidden md:flex rounded-sm font-mono text-[10px] uppercase border-border"
            onClick={() => setInteractionOpen(true)}
          >
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
      </div>

      {/* Add Interaction Dialog */}
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

      {/* Edit Interaction Dialog */}
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

      {/* Delete Interaction Dialog */}
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

      {/* AI Meeting Notes Modal */}
      <AiMeetingNotesModal
        targetId={targetId}
        targetName=""
        isOpen={aiNotesOpen}
        onClose={() => setAiNotesOpen(false)}
        onApplied={() => {
          invalidateInteractions();
          qc.invalidateQueries({ queryKey: getListActionsQueryKey(targetId) });
          qc.invalidateQueries({ queryKey: getGetStageHistoryQueryKey(targetId) });
          qc.invalidateQueries({ queryKey: getGetTargetQueryKey(targetId) });
        }}
      />
    </>
  );
}
