import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, User, Zap, ChevronDown, ChevronRight, X, Check, Loader2 } from "lucide-react";
import { QuickLogInteractionPopover } from "@/components/quick-log-interaction-popover";
import { HealthDot } from "@/components/health-dot";
import { StageChip } from "@/components/stage-chip";
import { PIPELINE_STAGE_ORDER, OFF_TRACK_STAGES, getStagesForDealType } from "@/components/stage-rail";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateTargetStage, useReorderTargets } from "@workspace/api-client-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KanbanTarget {
  id: number;
  projectName?: string | null;
  targetCode?: string | null;
  currentStage?: string | null;
  priorityTier?: string | null;
  priorityScore?: number | null;
  dealOwner?: string | null;
  needsAttention?: boolean | null;
  openActionCount?: number | null;
  overdueActionCount?: number | null;
  dealType?: string | null;
  healthScore?: string | null;
  kanbanSortOrder?: number | null;
}

interface PipelineKanbanProps {
  targets: KanbanTarget[];
  aiMode?: string | null;
  stageFilter?: string;
  dealTypeFilter?: string;
  onRefresh?: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NON_DEFAULT_DEAL_TYPES: Record<string, string> = {
  "JV": "JV",
  "Partnership": "Partner",
  "Strategic Alliance": "Alliance",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTierBadgeColor(tier: string | null | undefined): string {
  switch (tier) {
    case "Must-Win":   return "bg-destructive text-destructive-foreground border-0";
    case "Priority 1": return "bg-amber-500 text-white border-0";
    case "Priority 2": return "bg-primary text-primary-foreground border-0";
    case "Watchlist":  return "bg-muted text-muted-foreground border-border";
    default:           return "bg-secondary text-secondary-foreground border-0";
  }
}

function getTierCardAccent(tier: string | null | undefined): string {
  switch (tier) {
    case "Must-Win":   return "border-l-destructive/50";
    case "Priority 1": return "border-l-amber-500/50";
    case "Priority 2": return "border-l-primary/50";
    default:           return "border-l-border/40";
  }
}

const ALL_ACTIVE_STAGES = PIPELINE_STAGE_ORDER.filter(s => !OFF_TRACK_STAGES.includes(s));
const OFF_TRACK = OFF_TRACK_STAGES;

const STAGE_CHANGE_REASONS = [
  "Deal progressed as planned",
  "Management meeting completed",
  "NDA executed",
  "LOI / NBO submitted",
  "IC approval received",
  "Diligence findings reviewed",
  "Commercial terms agreed",
  "Definitive agreement signed",
  "Regulatory clearance received",
  "Other",
];

// ── Sortable Card ─────────────────────────────────────────────────────────────

function SortableCard({
  target,
  isDragging = false,
  isOffTrack = false,
  isSaving = false,
  isOver = false,
}: {
  target: KanbanTarget;
  isDragging?: boolean;
  isOffTrack?: boolean;
  isSaving?: boolean;
  isOver?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: `card-${target.id}`,
    data: { target },
    disabled: isOffTrack || isSaving,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const overdueCount = target.overdueActionCount ?? 0;
  const openCount = target.openActionCount ?? 0;

  const cardContent = (
    <div
      className={`group/card bg-card border border-border/70 border-l-2 ${getTierCardAccent(target.priorityTier)} rounded-lg p-3 space-y-2 ${
        isDragging
          ? "shadow-xl opacity-90 rotate-1"
          : isSaving
            ? "opacity-60"
            : isOver
              ? "border-primary/40 bg-primary/5"
              : "hover:shadow-md hover:border-border"
      } transition-all duration-150`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold leading-snug truncate group-hover:text-primary transition-colors">
            {target.projectName ?? "Untitled"}
          </div>
          <div className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider mt-0.5">
            {target.targetCode}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <HealthDot score={target.healthScore as "healthy" | "watch" | "at_risk" | null | undefined} />
          {target.needsAttention && (
            <AlertTriangle size={11} className="text-destructive" />
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={`font-mono text-[9px] uppercase rounded-sm px-1.5 py-0 h-4 ${getTierBadgeColor(target.priorityTier)}`}>
          {target.priorityTier ?? "—"}
        </Badge>
        {target.dealType && NON_DEFAULT_DEAL_TYPES[target.dealType] && (
          <Badge className="font-mono text-[9px] uppercase rounded-sm px-1.5 py-0 h-4 bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30">
            {NON_DEFAULT_DEAL_TYPES[target.dealType]}
          </Badge>
        )}
        {target.priorityScore != null && (
          <span className="text-[9px] font-mono text-muted-foreground/60 flex items-center gap-0.5">
            <Zap size={8} className="text-primary/50" />
            {Math.round(target.priorityScore)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1.5">
        {target.dealOwner ? (
          <span className="text-[9px] font-mono text-muted-foreground/60 flex items-center gap-0.5 min-w-0 truncate">
            <User size={8} className="shrink-0" />
            <span className="truncate">{target.dealOwner}</span>
          </span>
        ) : <span />}
        <div className="flex items-center gap-1.5 shrink-0">
          {openCount > 0 && (
            <span className={`text-[9px] font-mono ${overdueCount > 0 ? "text-destructive" : "text-amber-500"}`}>
              {openCount} action{openCount !== 1 ? "s" : ""}
            </span>
          )}
          <QuickLogInteractionPopover
            targetId={target.id}
            targetName={target.projectName ?? target.targetCode ?? ""}
          />
        </div>
      </div>
      {!isOffTrack && (
        <div className={`text-[9px] font-mono text-center border-t border-border/30 pt-1.5 mt-0.5 transition-opacity duration-150 flex items-center justify-center gap-1 ${
          isSaving ? "opacity-100 text-primary/60" : "opacity-0 group-hover/card:opacity-100 text-muted-foreground/40"
        }`}>
          {isSaving
            ? <><Loader2 size={8} className="animate-spin" /> saving…</>
            : "drag to reorder or move stage"}
        </div>
      )}
    </div>
  );

  if (isOffTrack) {
    return (
      <Link href={`/targets/${target.id}`}>
        <div className="cursor-pointer group">{cardContent}</div>
      </Link>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing touch-none select-none"
    >
      <Link href={`/targets/${target.id}`}>
        <div>{cardContent}</div>
      </Link>
    </div>
  );
}

// ── Droppable + Sortable Column ────────────────────────────────────────────────

function DroppableColumn({
  stage,
  targets,
  aiMode,
  isOffTrack = false,
  isOver = false,
  savingIds,
  overCardId,
}: {
  stage: string;
  targets: KanbanTarget[];
  aiMode?: string | null;
  isOffTrack?: boolean;
  isOver?: boolean;
  savingIds?: Set<number>;
  overCardId?: number | null;
}) {
  const { setNodeRef } = useDroppable({ id: `col-${stage}`, disabled: isOffTrack });
  const count = targets.length;
  const sortableIds = targets.map(t => `card-${t.id}`);

  return (
    <div
      ref={isOffTrack ? undefined : setNodeRef}
      className={`flex flex-col shrink-0 w-[220px] transition-colors ${isOver ? "bg-primary/5 rounded-xl" : ""}`}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <StageChip stage={stage} size="xs" />
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {count}
          </span>
        </div>
        {isOffTrack && count > 0 && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono text-muted-foreground/50">
            off-track
          </Badge>
        )}
      </div>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className={`flex flex-col gap-2 min-h-[80px] p-2 rounded-xl border ${isOver ? "border-primary/30 bg-primary/5" : "border-transparent"} transition-colors`}>
          {count === 0 && (
            <div className="flex items-center justify-center h-16 text-[10px] font-mono text-muted-foreground/30">
              0 deals
            </div>
          )}
          {targets.map(t => (
            <SortableCard
              key={t.id}
              target={t}
              isOffTrack={isOffTrack}
              isSaving={savingIds?.has(t.id)}
              isOver={overCardId === t.id}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ── Stage Change Dialog ────────────────────────────────────────────────────────

interface StageChangePending {
  target: KanbanTarget;
  newStage: string;
}

interface VerdictData {
  closeReasonCode?: string;
  phase1VerdictAccuracy?: string;
  phase1VerdictNote?: string;
  closeMissTheme?: string;
}

const CLOSURE_VERDICT_STAGES = new Set(["Closed", "Dropped"]);

function KanbanStageChangeDialog({
  pending,
  onConfirm,
  onCancel,
  isSaving,
}: {
  pending: StageChangePending | null;
  onConfirm: (reason: string, verdict: VerdictData) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [closeReasonCode, setCloseReasonCode] = useState("");
  const [phase1VerdictAccuracy, setPhase1VerdictAccuracy] = useState("");
  const [phase1VerdictNote, setPhase1VerdictNote] = useState("");
  const [closeMissTheme, setCloseMissTheme] = useState("");

  const effectiveReason = reason === "Other" ? customReason : reason;
  const isClosureStage = CLOSURE_VERDICT_STAGES.has(pending?.newStage ?? "");

  const verdictIncomplete =
    (isClosureStage && !phase1VerdictAccuracy) ||
    (pending?.newStage === "Dropped" && !closeReasonCode) ||
    (["Partially-correct", "Wrong"].includes(phase1VerdictAccuracy) && !phase1VerdictNote.trim());

  const handleConfirm = () => {
    if (!effectiveReason.trim() || verdictIncomplete) return;
    onConfirm(effectiveReason, {
      ...(closeReasonCode && { closeReasonCode }),
      ...(phase1VerdictAccuracy && { phase1VerdictAccuracy }),
      ...(phase1VerdictNote.trim() && { phase1VerdictNote: phase1VerdictNote.trim() }),
      ...(closeMissTheme && { closeMissTheme }),
    });
  };

  const handleCancel = () => {
    setReason(""); setCustomReason("");
    setCloseReasonCode(""); setPhase1VerdictAccuracy(""); setPhase1VerdictNote(""); setCloseMissTheme("");
    onCancel();
  };

  if (!pending) return null;

  return (
    <Dialog open={!!pending} onOpenChange={v => !v && handleCancel()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Move to {pending.newStage}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            Moving <span className="font-semibold text-foreground">{pending.target.projectName ?? pending.target.targetCode}</span>{" "}
            from <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{pending.target.currentStage}</span>{" "}
            to <span className="font-mono text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{pending.newStage}</span>
          </div>
          <div className="space-y-1.5">
            <Label>Reason for stage change <span className="text-destructive">*</span></Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {STAGE_CHANGE_REASONS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {reason === "Other" && (
            <div className="space-y-1.5">
              <Label>Custom reason</Label>
              <Textarea
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="Describe the reason…"
                rows={2}
              />
            </div>
          )}

          {/* Verdict section for Closed / Dropped */}
          {isClosureStage && (
            <div className="space-y-3 border border-amber-500/30 bg-amber-500/5 rounded-md p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-amber-600 font-semibold flex items-center gap-1.5">
                <AlertTriangle size={11} />
                Deal Close Verdict
              </div>

              {pending.newStage === "Dropped" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Close Reason Code <span className="text-destructive">*</span></Label>
                  <Select value={closeReasonCode} onValueChange={setCloseReasonCode}>
                    <SelectTrigger><SelectValue placeholder="Select reason…" /></SelectTrigger>
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
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Phase 1 AI Screen Accuracy <span className="text-destructive">*</span></Label>
                <Select value={phase1VerdictAccuracy} onValueChange={setPhase1VerdictAccuracy}>
                  <SelectTrigger><SelectValue placeholder="Was the Phase 1 AI screen correct?" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Correct">Correct</SelectItem>
                    <SelectItem value="Partially-correct">Partially-correct</SelectItem>
                    <SelectItem value="Wrong">Wrong</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {["Partially-correct", "Wrong"].includes(phase1VerdictAccuracy) && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Accuracy Note <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={phase1VerdictNote}
                    onChange={e => setPhase1VerdictNote(e.target.value)}
                    placeholder="What did the AI get wrong or miss?"
                    rows={2}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Miss Theme <span className="text-muted-foreground/60">(optional)</span></Label>
                <Select value={closeMissTheme} onValueChange={setCloseMissTheme}>
                  <SelectTrigger><SelectValue placeholder="Tag a miss theme…" /></SelectTrigger>
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
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!effectiveReason.trim() || verdictIncomplete || isSaving}
          >
            {isSaving ? "Moving…" : `Move to ${pending.newStage}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main PipelineKanban ────────────────────────────────────────────────────────

export function PipelineKanban({
  targets,
  aiMode,
  stageFilter,
  dealTypeFilter,
  onRefresh,
}: PipelineKanbanProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const [activeCard, setActiveCard] = useState<KanbanTarget | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pending, setPending] = useState<StageChangePending | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Optimistic stage overrides: id → new stage while the API call is in-flight
  const [optimisticStages, setOptimisticStages] = useState<Map<number, string>>(new Map);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set);

  // Local ordering state: stage → ordered array of target IDs
  // This is the source of truth for card order within each column
  const [localOrders, setLocalOrders] = useState<Record<string, number[]>>({});

  // Snapshot of the stage's order at drag-start — used to rollback on cancel/failure
  const preDragOrderRef = useRef<{ stage: string; order: number[] } | null>(null);

  const changeStage = useUpdateTargetStage();
  const reorderMutation = useReorderTargets();

  // Initialise / sync localOrders whenever the targets prop changes
  useEffect(() => {
    setLocalOrders(prev => {
      const next: Record<string, number[]> = {};

      // Group targets by stage, sorted by kanbanSortOrder
      const byStage: Record<string, KanbanTarget[]> = {};
      for (const t of targets) {
        const stage = t.currentStage ?? "Unknown";
        if (!byStage[stage]) byStage[stage] = [];
        byStage[stage].push(t);
      }
      for (const stage of Object.keys(byStage)) {
        byStage[stage].sort(
          (a, b) => (a.kanbanSortOrder ?? 0) - (b.kanbanSortOrder ?? 0),
        );
      }

      for (const [stage, cards] of Object.entries(byStage)) {
        const incomingIds = cards.map(c => c.id);
        const prevIds = prev[stage] ?? [];

        // Keep the existing user-defined order from localOrders if the set of
        // IDs for this stage is unchanged — this avoids the order resetting
        // mid-session after every query invalidation.
        const prevSet = new Set(prevIds);
        const incomingSet = new Set(incomingIds);
        const same =
          prevIds.length === incomingIds.length &&
          incomingIds.every(id => prevSet.has(id));

        if (same) {
          next[stage] = prevIds;
        } else {
          // New IDs arrived (after a stage move etc.) — rebuild order:
          // keep existing order for IDs still present, append new ones at end
          const kept = prevIds.filter(id => incomingSet.has(id));
          const added = incomingIds.filter(id => !prevSet.has(id));
          next[stage] = [...kept, ...added];
        }
      }

      return next;
    });
  }, [targets]);

  // Apply optimistic stage overrides
  const targetsWithOverrides = targets.map(t =>
    optimisticStages.has(t.id)
      ? { ...t, currentStage: optimisticStages.get(t.id) }
      : t
  );

  // Build stage → ordered KanbanTarget[] using localOrders
  const byStageRaw: Record<string, KanbanTarget[]> = {};
  for (const t of targetsWithOverrides) {
    const s = t.currentStage ?? "Unknown";
    if (!byStageRaw[s]) byStageRaw[s] = [];
    byStageRaw[s].push(t);
  }

  const byStage: Record<string, KanbanTarget[]> = {};
  for (const [stage, cards] of Object.entries(byStageRaw)) {
    const order = localOrders[stage];
    if (order && order.length > 0) {
      const cardMap = new Map(cards.map(c => [c.id, c]));
      const ordered = order.flatMap(id => {
        const c = cardMap.get(id);
        return c ? [c] : [];
      });
      const unordered = cards.filter(c => !order.includes(c.id));
      byStage[stage] = [...ordered, ...unordered];
    } else {
      byStage[stage] = cards;
    }
  }

  // Apply stage + deal-type filters
  const dealTypeStages = dealTypeFilter && dealTypeFilter !== "all"
    ? getStagesForDealType(dealTypeFilter).filter(s => !OFF_TRACK_STAGES.includes(s))
    : ALL_ACTIVE_STAGES;

  const filtered: Record<string, KanbanTarget[]> = {};
  if (stageFilter && stageFilter !== "all") {
    if (byStage[stageFilter]) filtered[stageFilter] = byStage[stageFilter];
  } else {
    for (const [stage, cards] of Object.entries(byStage)) {
      filtered[stage] = cards;
    }
  }

  const activeStages = dealTypeStages.filter(
    s => !stageFilter || stageFilter === "all" || stageFilter === s,
  );
  const offTrackTargets = OFF_TRACK.flatMap(s => byStage[s] ?? []);

  // Helper: find which stage a target ID currently lives in (post-overrides)
  const getTargetStage = useCallback(
    (id: number): string | null => {
      const t = targetsWithOverrides.find(x => x.id === id);
      return t?.currentStage ?? null;
    },
    [targetsWithOverrides],
  );

  // Derive the hovered column stage from the current overId
  const hoverStage = overId?.startsWith("col-")
    ? overId.replace("col-", "")
    : overId?.startsWith("card-")
      ? getTargetStage(Number(overId.replace("card-", "")))
      : null;

  // The card ID being hovered (for per-card highlight)
  const overCardId = overId?.startsWith("card-")
    ? Number(overId.replace("card-", ""))
    : null;

  function handleDragStart(e: DragStartEvent) {
    const card = (e.active.data.current as { target: KanbanTarget })?.target;
    if (card) {
      setActiveCard(card);
      // Snapshot the current order for this card's stage so we can roll back
      const stage = getTargetStage(card.id) ?? card.currentStage ?? "";
      preDragOrderRef.current = {
        stage,
        order: [...(localOrders[stage] ?? [])],
      };
    }
  }

  function handleDragOver(e: DragOverEvent) {
    const overIdStr = e.over?.id as string | null;
    setOverId(overIdStr ?? null);

    if (!overIdStr || !overIdStr.startsWith("card-")) return;
    if (!activeCard) return;

    const activeTargetId = activeCard.id;
    const overTargetId = Number(overIdStr.replace("card-", ""));
    if (activeTargetId === overTargetId) return;

    const activeStage = getTargetStage(activeTargetId);
    const overStage = getTargetStage(overTargetId);

    // Only reorder within the same stage
    if (!activeStage || !overStage || activeStage !== overStage) return;

    setLocalOrders(prev => {
      const stageOrder = prev[activeStage] ? [...prev[activeStage]] : [];
      const oldIdx = stageOrder.indexOf(activeTargetId);
      const newIdx = stageOrder.indexOf(overTargetId);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev;
      return { ...prev, [activeStage]: arrayMove(stageOrder, oldIdx, newIdx) };
    });
  }

  function restorePreDragOrder() {
    const snap = preDragOrderRef.current;
    if (snap) {
      setLocalOrders(prev => ({ ...prev, [snap.stage]: snap.order }));
    }
    preDragOrderRef.current = null;
  }

  function handleDragEnd(e: DragEndEvent) {
    const card = (e.active.data.current as { target: KanbanTarget })?.target;
    setActiveCard(null);
    setOverId(null);

    if (!card || !e.over) {
      // Drag was cancelled or dropped outside — restore pre-drag order
      restorePreDragOrder();
      return;
    }

    const overIdStr = e.over.id as string;

    // Determine which stage the card was dropped into
    let newStage: string;
    if (overIdStr.startsWith("col-")) {
      newStage = overIdStr.replace("col-", "");
    } else if (overIdStr.startsWith("card-")) {
      const overTargetId = Number(overIdStr.replace("card-", ""));
      newStage = getTargetStage(overTargetId) ?? card.currentStage ?? "";
    } else {
      return;
    }

    const currentStageForCard = optimisticStages.get(card.id) ?? card.currentStage;

    if (newStage === currentStageForCard) {
      // ── Within-column drop: persist the new order ──────────────────────────
      const order = localOrders[newStage];
      // preDragOrderRef holds the pre-drag order captured in handleDragStart
      const rollbackSnapshot = preDragOrderRef.current;
      preDragOrderRef.current = null;

      if (order && order.length > 1) {
        const updates = order.map((id, idx) => ({ id, sortOrder: idx + 1 }));
        reorderMutation.mutate(
          { data: { orders: updates } },
          {
            onError: () => {
              // Snap back to pre-drag order if the API call fails
              if (rollbackSnapshot) {
                setLocalOrders(prev => ({
                  ...prev,
                  [rollbackSnapshot.stage]: rollbackSnapshot.order,
                }));
              }
              toast({
                title: "Reorder failed",
                description: "Could not save the new card order.",
                variant: "destructive",
              });
            },
          },
        );
      }
      return;
    }

    // ── Cross-column drop: open stage-change dialog ────────────────────────
    if (OFF_TRACK.includes(newStage)) return;
    setPending({ target: card, newStage });
  }

  async function handleConfirmStageChange(reason: string, verdict: VerdictData) {
    if (!pending) return;

    const targetId = pending.target.id;
    const newStage = pending.newStage;

    setOptimisticStages(prev => new Map(prev).set(targetId, newStage));
    setSavingIds(prev => new Set(prev).add(targetId));
    setIsSaving(true);
    setPending(null);

    // Also update localOrders: remove from old stage, append to new stage
    const oldStage = pending.target.currentStage ?? "";
    setLocalOrders(prev => {
      const next = { ...prev };
      if (next[oldStage]) next[oldStage] = next[oldStage].filter(id => id !== targetId);
      if (!next[newStage]) next[newStage] = [];
      next[newStage] = [...next[newStage], targetId];
      return next;
    });

    try {
      await changeStage.mutateAsync({
        id: targetId,
        data: { newStage, changeReason: reason, ...verdict },
      });
      toast({
        title: "Stage updated",
        description: `${pending.target.projectName ?? pending.target.targetCode} moved to ${newStage}.`,
      });
      onRefresh?.();
    } catch {
      setOptimisticStages(prev => {
        const next = new Map(prev);
        next.delete(targetId);
        return next;
      });
      toast({
        title: "Stage change failed",
        description: "Could not update stage. The card has been returned to its original column.",
        variant: "destructive",
      });
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
      setIsSaving(false);
    }
  }

  const [offTrackOpen, setOffTrackOpen] = useState(false);

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 pt-1 min-h-[400px]">
          {/* Active stage columns */}
          {activeStages.map(stage => (
            <DroppableColumn
              key={stage}
              stage={stage}
              targets={filtered[stage] ?? []}
              aiMode={aiMode}
              isOver={hoverStage === stage}
              savingIds={savingIds}
              overCardId={overCardId}
            />
          ))}

          {/* Off-Track collapsed column */}
          {offTrackTargets.length > 0 && (
            <div className="flex flex-col shrink-0 w-[220px]">
              <button
                onClick={() => setOffTrackOpen(v => !v)}
                className="flex items-center justify-between mb-2 px-1 w-full group"
              >
                <div className="flex items-center gap-1.5">
                  {offTrackOpen
                    ? <ChevronDown size={12} className="text-muted-foreground/50" />
                    : <ChevronRight size={12} className="text-muted-foreground/50" />}
                  <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
                    Off-Track
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono">
                    {offTrackTargets.length}
                  </Badge>
                </div>
              </button>
              {offTrackOpen && (
                <div className="flex flex-col gap-2 p-2 rounded-xl border border-border/40 bg-muted/20">
                  {offTrackTargets.map(t => (
                    <SortableCard key={t.id} target={t} isOffTrack />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drag overlay — floating card while dragging */}
        <DragOverlay dropAnimation={null}>
          {activeCard && (
            <div className="w-[220px] pointer-events-none">
              <SortableCard target={activeCard} isDragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <KanbanStageChangeDialog
        pending={pending}
        onConfirm={handleConfirmStageChange}
        onCancel={() => setPending(null)}
        isSaving={isSaving}
      />
    </>
  );
}
