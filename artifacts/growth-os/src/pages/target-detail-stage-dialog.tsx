import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  useUpdateTargetStage, useGetStageGate,
  getGetTargetQueryKey, getGetStageHistoryQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StageRail, OFF_TRACK_STAGES } from "@/components/stage-rail";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface StageChangeDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetId: number;
  target: { currentStage?: string | null; dealType?: string | null };
  onSuccess?: () => void;
}

export function StageChangeDialog({ open, onOpenChange, targetId, target, onSuccess }: StageChangeDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stageVal, setStageVal] = useState("");
  const [stageReason, setStageReason] = useState("");
  const [closeReasonCode, setCloseReasonCode] = useState("");
  const [phase1VerdictAccuracy, setPhase1VerdictAccuracy] = useState("");
  const [phase1VerdictNote, setPhase1VerdictNote] = useState("");
  const [closeMissTheme, setCloseMissTheme] = useState("");

  const isClosureStage = new Set(["Closed", "Dropped"]).has(stageVal);
  const updateStage = useUpdateTargetStage();

  const { data: stageGateData, isFetching: loadingGate } = useGetStageGate(
    targetId,
    { newStage: stageVal },
    { query: { enabled: !!stageVal && open, queryKey: [`/api/targets/${targetId}/stage-gate`, { newStage: stageVal }] } },
  );

  const verdictIncomplete =
    (isClosureStage && !phase1VerdictAccuracy) ||
    (stageVal === "Dropped" && !closeReasonCode) ||
    (["Partially-correct", "Wrong"].includes(phase1VerdictAccuracy) && !phase1VerdictNote.trim());

  function resetState() {
    setStageVal(""); setStageReason(""); setCloseReasonCode("");
    setPhase1VerdictAccuracy(""); setPhase1VerdictNote(""); setCloseMissTheme("");
  }

  function handleClose() { onOpenChange(false); resetState(); }

  function handleUpdateStage() {
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
          handleClose();
          queryClient.invalidateQueries({ queryKey: getGetTargetQueryKey(targetId) });
          queryClient.invalidateQueries({ queryKey: getGetStageHistoryQueryKey(targetId) });
          onSuccess?.();
        },
        onError: () => toast({ title: "Error", description: "Stage update failed", variant: "destructive" }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-[600px] border-border bg-sidebar rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-sans font-semibold text-lg">Change Pipeline Stage</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-5">
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Current Stage</div>
            <span className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/40 text-primary font-mono text-[11px] px-2.5 py-1 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              {target.currentStage}
            </span>
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
                  <button key={s} type="button" onClick={() => setStageVal(s)}
                    className={`px-2 py-1 rounded-md border font-mono text-[9px] uppercase tracking-wide transition-all duration-150 ${
                      isSelected
                        ? s === "On Hold"
                          ? "bg-amber-500/20 border-amber-500 text-amber-500 font-semibold"
                          : "bg-destructive/20 border-destructive text-destructive font-semibold"
                        : "bg-background/50 border-border/50 text-muted-foreground/60 hover:border-border hover:text-muted-foreground"
                    }`}
                  >{s}</button>
                );
              })}
            </div>
          </div>

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
                        {item.detail && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{item.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!loadingGate && stageGateData && stageGateData.gateItems.length > 0 && (
                <p className="text-[10px] text-muted-foreground/50 font-mono italic">These are advisory — you can proceed regardless.</p>
              )}
              {!loadingGate && stageGateData && stageGateData.gateItems.length === 0 && (
                <p className="text-[10px] text-muted-foreground/50 font-mono italic">No prerequisite checks for this stage.</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {stageVal === "Rejected" || stageVal === "On Hold"
                ? <>Drop / Hold Reason <span className="text-destructive">*</span></>
                : <>Rationale / Notes <span className="text-destructive">*</span></>}
            </label>
            <Textarea
              value={stageReason}
              onChange={(e) => setStageReason(e.target.value)}
              className="rounded-sm bg-background/50 resize-none h-20"
              placeholder={
                stageVal === "Rejected" ? "Required — state the primary reason this deal is being dropped"
                  : stageVal === "On Hold" ? "Required — explain why the deal is being put on hold"
                  : "Required — explain the reason for this stage change"
              }
            />
            {stageVal && !stageReason.trim() && (
              <p className="text-[10px] text-destructive font-mono">A reason is required to change stage.</p>
            )}
          </div>

          {isClosureStage && (
            <div className="space-y-3 border border-amber-500/30 bg-amber-500/5 rounded-sm p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-amber-600 font-semibold flex items-center gap-1.5">
                <AlertTriangle size={11} /> Deal Close Verdict
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
                      {["Price mismatch","Owner unwilling to sell","Competitive process lost","Strategy change","Regulatory block","Due diligence finding","Target approach failed","Process abandoned","Other"].map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!closeReasonCode && <p className="text-[10px] text-destructive font-mono">Close reason is required for Dropped deals.</p>}
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
                  <Textarea value={phase1VerdictNote} onChange={(e) => setPhase1VerdictNote(e.target.value)}
                    className="rounded-sm bg-background/50 resize-none h-16"
                    placeholder="Briefly describe what the AI got wrong or missed…" />
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
                    {["Strategy mismatch","Valuation gap","Competitive loss","Regulatory block","Management resistance","Due diligence finding","Timing","AI false positive","Other"].map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
          <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
            <Button onClick={handleUpdateStage} disabled={!stageVal || !stageReason.trim() || verdictIncomplete || updateStage.isPending} className="rounded-sm font-mono uppercase text-[10px]">
              {stageVal ? `Move to ${stageVal}` : "Select a Stage"}
            </Button>
          </motion.div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
