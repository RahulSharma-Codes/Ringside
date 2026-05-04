import React, { useState, useCallback } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Sparkles, AlertTriangle, ChevronDown, ChevronRight,
  Copy, Check, CheckCircle2, Bot, Info,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { ALL_KNOWN_STAGES } from "@/components/stage-rail";

// ── Constants ────────────────────────────────────────────────────────────────

const NOTE_TYPES = [
  "Meeting", "Call", "Banker Update", "Management Discussion",
  "Internal Discussion", "Email Summary", "Mobile Note", "Diligence Finding",
];
const SENTIMENTS = ["Positive", "Neutral", "Negative"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

// ── Types ────────────────────────────────────────────────────────────────────

interface SuggestionInteraction {
  interactionType: string;
  summary: string;
  participantsInternal: string;
  participantsExternal: string;
  sentiment: string;
  valuationSignal: string;
}

interface SuggestionAction {
  description: string;
  owner: string;
  dueDate: string | null;
  priority: string;
}

interface SuggestionStageChange {
  suggested: boolean;
  newStage: string;
  reason: string;
  confidence: string;
}

interface SuggestionRisk {
  title: string;
  detail: string;
  severity: string;
}

interface Suggestions {
  interaction: SuggestionInteraction;
  actions: SuggestionAction[];
  stageChange: SuggestionStageChange;
  risks: SuggestionRisk[];
  followUpQuestions: string[];
}

interface EditableAction extends SuggestionAction {
  uid: string;
  selected: boolean;
}

interface ApplyResults {
  interactionCreated: boolean;
  actionsCreated: number;
  stageChanged: boolean;
}

type Step = "input" | "loading" | "review" | "applying" | "success";

export interface AiMeetingNotesModalProps {
  targetId: number;
  targetName: string;
  isOpen: boolean;
  onClose: () => void;
  onApplied: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function severityColor(s: string) {
  if (s === "High") return "text-destructive";
  if (s === "Medium") return "text-amber-500";
  return "text-muted-foreground";
}

function confidenceColor(c: string) {
  if (c === "High") return "text-emerald-500";
  if (c === "Low") return "text-amber-500";
  return "text-muted-foreground";
}

// ── Component ────────────────────────────────────────────────────────────────

export function AiMeetingNotesModal({
  targetId,
  targetName,
  isOpen,
  onClose,
  onApplied,
}: AiMeetingNotesModalProps) {
  const [step, setStep] = useState<Step>("input");
  const [noteType, setNoteType] = useState("Meeting");
  const [rawNotes, setRawNotes] = useState("");
  const [noteDate, setNoteDate] = useState("");
  const [participants, setParticipants] = useState("");

  const [setupRequired, setSetupRequired] = useState(false);
  const [billingRequired, setBillingRequired] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [interactionSelected, setInteractionSelected] = useState(true);
  const [editableInteraction, setEditableInteraction] = useState<SuggestionInteraction>({
    interactionType: "Meeting",
    summary: "",
    participantsInternal: "",
    participantsExternal: "",
    sentiment: "",
    valuationSignal: "",
  });
  const [editableActions, setEditableActions] = useState<EditableAction[]>([]);
  const [stageChangeSelected, setStageChangeSelected] = useState(false);
  const [editableStageChange, setEditableStageChange] = useState<SuggestionStageChange>({
    suggested: false, newStage: "", reason: "", confidence: "",
  });
  const [risks, setRisks] = useState<SuggestionRisk[]>([]);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [risksOpen, setRisksOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResults, setApplyResults] = useState<ApplyResults | null>(null);

  const [copiedRisks, setCopiedRisks] = useState(false);
  const [copiedFollowUp, setCopiedFollowUp] = useState(false);

  const resetAll = useCallback(() => {
    setStep("input");
    setNoteType("Meeting");
    setRawNotes("");
    setNoteDate("");
    setParticipants("");
    setSetupRequired(false);
    setBillingRequired(false);
    setAiError(null);
    setInteractionSelected(true);
    setEditableActions([]);
    setStageChangeSelected(false);
    setRisks([]);
    setFollowUpQuestions([]);
    setRisksOpen(false);
    setFollowUpOpen(false);
    setConfirmOpen(false);
    setApplyError(null);
    setApplyResults(null);
  }, []);

  const handleClose = useCallback(() => {
    resetAll();
    onClose();
  }, [resetAll, onClose]);

  const handleSubmit = async () => {
    if (!rawNotes.trim()) return;
    setStep("loading");
    setSetupRequired(false);
    setBillingRequired(false);
    setAiError(null);

    try {
      const resp = await customFetch<{
        suggestions: Suggestions | null;
        setupRequired?: boolean;
        billingRequired?: boolean;
        error?: string;
      }>("/api/ai/meeting-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId,
          noteType,
          rawNotes,
          date: noteDate || undefined,
          participants: participants || undefined,
        }),
      });

      if (resp.setupRequired) {
        setSetupRequired(true);
        setStep("input");
        return;
      }
      if (resp.billingRequired) {
        setBillingRequired(true);
        setStep("input");
        return;
      }
      if (!resp.suggestions) {
        setAiError(resp.error ?? "No suggestions returned");
        setStep("input");
        return;
      }

      const s = resp.suggestions;
      setEditableInteraction({ ...s.interaction });
      setEditableActions(
        s.actions.map((a, idx) => ({ ...a, uid: `action-${idx}`, selected: false }))
      );
      setStageChangeSelected(false);
      setEditableStageChange({ ...s.stageChange });
      setRisks(s.risks ?? []);
      setFollowUpQuestions(s.followUpQuestions ?? []);
      setStep("review");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Could not reach AI service");
      setStep("input");
    }
  };

  const handleApply = async () => {
    setConfirmOpen(false);
    setStep("applying");
    setApplyError(null);

    const results: ApplyResults = {
      interactionCreated: false,
      actionsCreated: 0,
      stageChanged: false,
    };

    try {
      if (interactionSelected) {
        await customFetch(`/api/targets/${targetId}/interactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interactionType: editableInteraction.interactionType,
            summary: editableInteraction.summary,
            participantsInternal: editableInteraction.participantsInternal || null,
            participantsExternal: editableInteraction.participantsExternal || null,
            sentiment: editableInteraction.sentiment || null,
            valuationSignal: editableInteraction.valuationSignal || null,
          }),
        });
        results.interactionCreated = true;
      }

      for (const action of editableActions.filter((a) => a.selected)) {
        await customFetch(`/api/targets/${targetId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: action.description,
            owner: action.owner || undefined,
            dueDate: action.dueDate || undefined,
            priority: action.priority,
          }),
        });
        results.actionsCreated++;
      }

      const stageIsValid =
        stageChangeSelected &&
        editableStageChange.newStage &&
        ALL_KNOWN_STAGES.includes(editableStageChange.newStage) &&
        editableStageChange.reason.trim();

      if (stageIsValid) {
        await customFetch(`/api/targets/${targetId}/stage`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newStage: editableStageChange.newStage,
            changeReason: editableStageChange.reason.trim(),
            changedBy: "AI-assisted",
          }),
        });
        results.stageChanged = true;
      }

      setApplyResults(results);
      setStep("success");
      onApplied();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Apply failed. Please try again.");
      setStep("review");
    }
  };

  const updateAction = (uid: string, field: keyof EditableAction, value: string | boolean) => {
    setEditableActions((prev) =>
      prev.map((a) => (a.uid === uid ? { ...a, [field]: value } : a))
    );
  };

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const stageIsValid = editableStageChange.newStage && ALL_KNOWN_STAGES.includes(editableStageChange.newStage);
  const stageSelectedButInvalid =
    stageChangeSelected &&
    (!editableStageChange.newStage ||
      !ALL_KNOWN_STAGES.includes(editableStageChange.newStage) ||
      !editableStageChange.reason.trim());
  const selectedActionCount = editableActions.filter((a) => a.selected).length;
  const nothingSelected = !interactionSelected && selectedActionCount === 0 && !stageChangeSelected;
  const interactionSummaryMissing = interactionSelected && !editableInteraction.summary.trim();
  const canApply = !stageSelectedButInvalid && !interactionSummaryMissing && !nothingSelected;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl flex flex-col p-0 gap-0 overflow-hidden"
        >
          {/* Header */}
          <SheetHeader className="px-5 py-4 border-b border-border/60 bg-background/80 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Sparkles size={14} className="text-primary" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-sm font-mono uppercase tracking-tight font-bold">
                  Parse Notes with AI
                </SheetTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{targetName}</p>
              </div>
            </div>
          </SheetHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">

            {/* ── SETUP REQUIRED ── */}
            {(setupRequired || billingRequired) && (
              <div className="p-6 flex flex-col items-center justify-center gap-4 text-center min-h-[300px]">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Sparkles size={20} className="text-amber-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {setupRequired ? "AI Not Configured" : "AI Credits Needed"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    AI workflows are built and ready. Add OpenAI API credits to activate them.
                  </p>
                </div>
              </div>
            )}

            {/* ── STEP: INPUT ── */}
            {step === "input" && !setupRequired && !billingRequired && (
              <div className="p-5 space-y-5">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/15">
                  <Info size={13} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    AI-generated suggestion — review before applying. AI will not write anything until you click Apply.
                  </p>
                </div>

                {aiError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    <AlertTriangle size={13} className="shrink-0" />
                    {aiError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Note Type
                  </Label>
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="rounded-lg h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NOTE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Raw Notes <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={rawNotes}
                    onChange={(e) => setRawNotes(e.target.value)}
                    placeholder="Paste meeting notes, call summary, banker update, or any discussion notes here…"
                    className="min-h-[220px] text-sm rounded-lg resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Date (optional)
                    </Label>
                    <Input
                      type="date"
                      value={noteDate}
                      onChange={(e) => setNoteDate(e.target.value)}
                      className="h-9 text-sm rounded-lg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                      Participants (optional)
                    </Label>
                    <Input
                      value={participants}
                      onChange={(e) => setParticipants(e.target.value)}
                      placeholder="Names or roles"
                      className="h-9 text-sm rounded-lg"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP: LOADING ── */}
            {step === "loading" && (
              <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-[300px]">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Loader2 size={20} className="text-primary animate-spin" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-sm">Parsing notes with AI…</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Extracting interactions, actions, and insights
                  </p>
                </div>
              </div>
            )}

            {/* ── STEP: APPLYING ── */}
            {step === "applying" && (
              <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-[300px]">
                <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Loader2 size={20} className="text-primary animate-spin" />
                </div>
                <p className="font-medium text-sm">Applying selected updates…</p>
              </div>
            )}

            {/* ── STEP: SUCCESS ── */}
            {step === "success" && applyResults && (
              <div className="flex flex-col items-center justify-center gap-5 p-8 min-h-[300px]">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 size={22} className="text-emerald-500" />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-semibold text-base">Updates Applied</p>
                  <p className="text-sm text-muted-foreground">The following were created in Ringside:</p>
                </div>
                <div className="w-full max-w-xs space-y-2">
                  {applyResults.interactionCreated && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 size={14} />
                      Interaction logged
                    </div>
                  )}
                  {applyResults.actionsCreated > 0 && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 size={14} />
                      {applyResults.actionsCreated} action{applyResults.actionsCreated !== 1 ? "s" : ""} created
                    </div>
                  )}
                  {applyResults.stageChanged && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 size={14} />
                      Stage updated
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP: REVIEW ── */}
            {step === "review" && (
              <div className="p-5 space-y-5">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/15">
                  <Info size={13} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    AI-generated suggestion — review and edit before applying. Nothing is saved until you click Apply.
                  </p>
                </div>

                {applyError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                    <AlertTriangle size={13} className="shrink-0" />
                    {applyError}
                  </div>
                )}
                {nothingSelected && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-700">
                    <AlertTriangle size={13} className="shrink-0" />
                    Nothing selected — check at least one update (interaction, action, or stage) before applying.
                  </div>
                )}
                {stageSelectedButInvalid && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-700">
                    <AlertTriangle size={13} className="shrink-0" />
                    Stage change selected — choose a valid stage and provide a reason before applying.
                  </div>
                )}
                {interactionSummaryMissing && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-700">
                    <AlertTriangle size={13} className="shrink-0" />
                    Interaction is checked — please add a summary before applying.
                  </div>
                )}

                {/* Interaction */}
                <div className={`space-y-3 border rounded-xl p-4 bg-card transition-colors ${interactionSelected ? "border-border/60" : "border-border/30 opacity-60"}`}>
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="include-interaction"
                      checked={interactionSelected}
                      onCheckedChange={(v) => setInteractionSelected(Boolean(v))}
                    />
                    <label htmlFor="include-interaction" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Bot size={13} className="text-primary" />
                      <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-muted-foreground">
                        Log Interaction
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Type</Label>
                      <Select
                        value={editableInteraction.interactionType}
                        onValueChange={(v) => setEditableInteraction((p) => ({ ...p, interactionType: v }))}
                      >
                        <SelectTrigger className="h-8 text-sm rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NOTE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sentiment</Label>
                      <Select
                        value={editableInteraction.sentiment || "__none__"}
                        onValueChange={(v) => setEditableInteraction((p) => ({ ...p, sentiment: v === "__none__" ? "" : v }))}
                      >
                        <SelectTrigger className="h-8 text-sm rounded-lg">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {SENTIMENTS.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Summary <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      value={editableInteraction.summary}
                      onChange={(e) => setEditableInteraction((p) => ({ ...p, summary: e.target.value }))}
                      className="text-sm rounded-lg min-h-[80px] resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Participants (Internal)</Label>
                      <Input
                        value={editableInteraction.participantsInternal}
                        onChange={(e) => setEditableInteraction((p) => ({ ...p, participantsInternal: e.target.value }))}
                        className="h-8 text-sm rounded-lg"
                        placeholder="Names, roles…"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Participants (External)</Label>
                      <Input
                        value={editableInteraction.participantsExternal}
                        onChange={(e) => setEditableInteraction((p) => ({ ...p, participantsExternal: e.target.value }))}
                        className="h-8 text-sm rounded-lg"
                        placeholder="Names, roles…"
                      />
                    </div>
                  </div>

                  {editableInteraction.valuationSignal && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Valuation Signal</Label>
                      <Input
                        value={editableInteraction.valuationSignal}
                        onChange={(e) => setEditableInteraction((p) => ({ ...p, valuationSignal: e.target.value }))}
                        className="h-8 text-sm rounded-lg"
                      />
                    </div>
                  )}
                </div>

                {/* Action Items */}
                {editableActions.length > 0 && (
                  <div className="space-y-3 border border-border/60 rounded-xl p-4 bg-card">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-muted-foreground">
                        Action Items
                      </span>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {selectedActionCount} selected
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Check the actions you want to create. All are unchecked by default.</p>
                    <div className="space-y-3">
                      {editableActions.map((action) => (
                        <div
                          key={action.uid}
                          className={`rounded-lg border p-3 space-y-2.5 transition-colors ${
                            action.selected ? "border-primary/30 bg-primary/5" : "border-border/40 bg-background"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <Checkbox
                              id={`action-${action.uid}`}
                              checked={action.selected}
                              onCheckedChange={(v) => updateAction(action.uid, "selected", Boolean(v))}
                              className="mt-0.5 shrink-0"
                            />
                            <Label
                              htmlFor={`action-${action.uid}`}
                              className="text-sm font-normal cursor-pointer leading-snug"
                            >
                              {action.description}
                            </Label>
                          </div>
                          {action.selected && (
                            <div className="pl-6 space-y-2">
                              <Textarea
                                value={action.description}
                                onChange={(e) => updateAction(action.uid, "description", e.target.value)}
                                className="text-sm rounded-lg min-h-[50px] resize-none"
                                placeholder="Action description"
                              />
                              <div className="grid grid-cols-3 gap-2">
                                <Input
                                  value={action.owner}
                                  onChange={(e) => updateAction(action.uid, "owner", e.target.value)}
                                  placeholder="Owner"
                                  className="h-8 text-sm rounded-lg"
                                />
                                <Input
                                  type="date"
                                  value={action.dueDate ?? ""}
                                  onChange={(e) => updateAction(action.uid, "dueDate", e.target.value || "")}
                                  className="h-8 text-sm rounded-lg"
                                />
                                <Select
                                  value={action.priority}
                                  onValueChange={(v) => updateAction(action.uid, "priority", v)}
                                >
                                  <SelectTrigger className="h-8 text-sm rounded-lg">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PRIORITIES.map((p) => (
                                      <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stage Change */}
                {editableStageChange.suggested && editableStageChange.newStage && (
                  <div className={`space-y-3 border rounded-xl p-4 bg-card transition-colors ${
                    stageChangeSelected ? "border-primary/30" : "border-border/60"
                  }`}>
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id="stage-change"
                        checked={stageChangeSelected}
                        onCheckedChange={(v) => setStageChangeSelected(Boolean(v))}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <Label htmlFor="stage-change" className="text-[11px] font-mono uppercase tracking-wider font-semibold text-muted-foreground cursor-pointer">
                          Suggested Stage Change
                        </Label>
                        <div className="flex flex-wrap gap-2 mt-2 items-center">
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md border font-semibold ${
                            stageIsValid
                              ? "bg-primary/10 border-primary/20 text-primary"
                              : "bg-destructive/10 border-destructive/20 text-destructive"
                          }`}>
                            → {editableStageChange.newStage}
                          </span>
                          {!stageIsValid && (
                            <span className="text-[10px] text-destructive flex items-center gap-1">
                              <AlertTriangle size={10} /> Not a valid stage
                            </span>
                          )}
                          {editableStageChange.confidence && (
                            <span className={`text-[10px] font-mono ${confidenceColor(editableStageChange.confidence)}`}>
                              {editableStageChange.confidence} confidence
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {stageChangeSelected && (
                      <div className="pl-6 space-y-1.5">
                        <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Change Reason <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                          value={editableStageChange.reason}
                          onChange={(e) => setEditableStageChange((p) => ({ ...p, reason: e.target.value }))}
                          className="text-sm rounded-lg min-h-[60px] resize-none"
                          placeholder="Enter reason for stage change (required)"
                        />
                        {!stageIsValid && (
                          <p className="text-[11px] text-destructive">
                            Cannot apply — suggested stage is not valid. Deselect or contact support.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Risks */}
                {risks.length > 0 && (
                  <Collapsible open={risksOpen} onOpenChange={setRisksOpen}>
                    <div className="border border-border/60 rounded-xl overflow-hidden">
                      <CollapsibleTrigger className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
                        {risksOpen
                          ? <ChevronDown size={13} className="text-muted-foreground shrink-0" />
                          : <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
                        <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-muted-foreground flex-1">
                          Risks & Red Flags
                        </span>
                        <Badge variant="secondary" className="text-[10px] font-mono shrink-0">{risks.length}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(
                              risks.map((r) => `${r.title} (${r.severity}): ${r.detail}`).join("\n"),
                              setCopiedRisks
                            );
                          }}
                        >
                          {copiedRisks ? <Check size={11} /> : <Copy size={11} />}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-4 pt-2 space-y-2 border-t border-border/40">
                          {risks.map((r, idx) => (
                            <div key={idx} className="text-sm">
                              <span className={`font-medium ${severityColor(r.severity)}`}>{r.title}</span>
                              {r.detail && <span className="text-muted-foreground"> — {r.detail}</span>}
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )}

                {/* Follow-up Questions */}
                {followUpQuestions.length > 0 && (
                  <Collapsible open={followUpOpen} onOpenChange={setFollowUpOpen}>
                    <div className="border border-border/60 rounded-xl overflow-hidden">
                      <CollapsibleTrigger className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
                        {followUpOpen
                          ? <ChevronDown size={13} className="text-muted-foreground shrink-0" />
                          : <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
                        <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-muted-foreground flex-1">
                          Follow-up Questions
                        </span>
                        <Badge variant="secondary" className="text-[10px] font-mono shrink-0">{followUpQuestions.length}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(followUpQuestions.join("\n"), setCopiedFollowUp);
                          }}
                        >
                          {copiedFollowUp ? <Check size={11} /> : <Copy size={11} />}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-4 pb-4 pt-2 space-y-1.5 border-t border-border/40">
                          {followUpQuestions.map((q, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <span className="text-muted-foreground/50 font-mono text-[10px] mt-0.5 shrink-0">
                                {idx + 1}.
                              </span>
                              {q}
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/60 px-5 py-3.5 shrink-0 bg-background/80 flex items-center gap-2 justify-between">
            {step === "input" && !setupRequired && !billingRequired && (
              <>
                <Button variant="ghost" size="sm" onClick={handleClose} className="text-muted-foreground">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!rawNotes.trim()}
                  className="gap-1.5"
                >
                  <Sparkles size={13} />
                  Parse with AI
                </Button>
              </>
            )}
            {(setupRequired || billingRequired) && (
              <Button variant="outline" size="sm" onClick={handleClose} className="ml-auto">
                Close
              </Button>
            )}
            {step === "loading" && (
              <p className="text-[11px] text-muted-foreground font-mono w-full text-center">
                Analysing notes…
              </p>
            )}
            {step === "review" && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setStep("input")} className="text-muted-foreground">
                  ← Edit Notes
                </Button>
                <Button
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canApply}
                  className="gap-1.5"
                >
                  Apply Selected Updates
                </Button>
              </>
            )}
            {step === "applying" && (
              <p className="text-[11px] text-muted-foreground font-mono w-full text-center flex items-center justify-center gap-1.5">
                <Loader2 size={11} className="animate-spin" />
                Applying…
              </p>
            )}
            {step === "success" && (
              <Button size="sm" onClick={handleClose} className="ml-auto">
                Done
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Selected Updates?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Ringside will create the selected interaction, actions, and stage update.
                AI will not apply anything you did not select.
              </span>
              <span className="block text-[11px] font-mono text-muted-foreground mt-2">
                • Interaction: will be logged
                {selectedActionCount > 0 && (
                  <> • {selectedActionCount} action{selectedActionCount !== 1 ? "s" : ""}: will be created</>
                )}
                {stageChangeSelected && editableStageChange.newStage && (
                  <> • Stage → {editableStageChange.newStage}: will be recorded</>
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Review Again</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply}>Confirm &amp; Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
