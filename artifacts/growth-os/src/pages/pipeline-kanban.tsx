import React, { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, User, Zap, ChevronDown, ChevronRight, X, Check } from "lucide-react";
import { StageChip } from "@/components/stage-chip";
import { PIPELINE_STAGE_ORDER, OFF_TRACK_STAGES, getStagesForDealType } from "@/components/stage-rail";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
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
import { useUpdateTargetStage } from "@workspace/api-client-react";

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
}

interface PipelineKanbanProps {
  targets: KanbanTarget[];
  aiMode?: string | null;
  stageFilter?: string;
  dealTypeFilter?: string;
  onRefresh?: () => void;
}

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

// ── Draggable Card ─────────────────────────────────────────────────────────────

function DraggableCard({
  target,
  isDragging = false,
  isOffTrack = false,
}: {
  target: KanbanTarget;
  isDragging?: boolean;
  isOffTrack?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `card-${target.id}`,
    data: { target },
    disabled: isOffTrack,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const overdueCount = target.overdueActionCount ?? 0;
  const openCount = target.openActionCount ?? 0;

  const cardContent = (
    <div
      className={`bg-card border border-border/70 border-l-2 ${getTierCardAccent(target.priorityTier)} rounded-lg p-3 space-y-2 ${isDragging ? "shadow-xl opacity-90 rotate-1" : "hover:shadow-md hover:border-border"} transition-all duration-150`}
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
        {target.needsAttention && (
          <AlertTriangle size={11} className="text-destructive shrink-0 mt-0.5" />
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={`font-mono text-[9px] uppercase rounded-sm px-1.5 py-0 h-4 ${getTierBadgeColor(target.priorityTier)}`}>
          {target.priorityTier ?? "—"}
        </Badge>
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
        {openCount > 0 && (
          <span className={`text-[9px] font-mono shrink-0 ${overdueCount > 0 ? "text-destructive" : "text-amber-500"}`}>
            {openCount} action{openCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {!isOffTrack && (
        <div className="text-[9px] text-muted-foreground/40 font-mono text-center border-t border-border/30 pt-1.5 mt-0.5">
          drag to move stage
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
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing touch-none select-none">
      <Link href={`/targets/${target.id}`}>
        <div>{cardContent}</div>
      </Link>
    </div>
  );
}

// ── Droppable Column ───────────────────────────────────────────────────────────

function DroppableColumn({
  stage,
  targets,
  aiMode,
  isOffTrack = false,
  isOver = false,
}: {
  stage: string;
  targets: KanbanTarget[];
  aiMode?: string | null;
  isOffTrack?: boolean;
  isOver?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `col-${stage}`, disabled: isOffTrack });
  const count = targets.length;

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
      <div className={`flex flex-col gap-2 min-h-[80px] p-2 rounded-xl border ${isOver ? "border-primary/30 bg-primary/5" : "border-transparent"} transition-colors`}>
        {count === 0 && (
          <div className="flex items-center justify-center h-16 text-[10px] font-mono text-muted-foreground/30">
            0 deals
          </div>
        )}
        {targets.map(t => (
          <DraggableCard key={t.id} target={t} isOffTrack={isOffTrack} />
        ))}
      </div>
    </div>
  );
}

// ── Stage Change Dialog ────────────────────────────────────────────────────────

interface StageChangePending {
  target: KanbanTarget;
  newStage: string;
}

function KanbanStageChangeDialog({
  pending,
  onConfirm,
  onCancel,
  isSaving,
}: {
  pending: StageChangePending | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const effectiveReason = reason === "Other" ? customReason : reason;

  if (!pending) return null;

  return (
    <Dialog open={!!pending} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={() => effectiveReason && onConfirm(effectiveReason)}
            disabled={!effectiveReason.trim() || isSaving}
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

  const changeStage = useUpdateTargetStage();

  // When a deal-type filter is active, only show columns applicable to that deal type
  const dealTypeStages = dealTypeFilter && dealTypeFilter !== "all"
    ? getStagesForDealType(dealTypeFilter).filter(s => !OFF_TRACK_STAGES.includes(s))
    : ALL_ACTIVE_STAGES;

  // Group targets by stage
  const filtered = stageFilter && stageFilter !== "all"
    ? targets.filter(t => t.currentStage === stageFilter)
    : targets;

  const byStage: Record<string, KanbanTarget[]> = {};
  for (const t of filtered) {
    const s = t.currentStage ?? "Unknown";
    if (!byStage[s]) byStage[s] = [];
    byStage[s].push(t);
  }

  const activeStages = dealTypeStages.filter(s => !stageFilter || stageFilter === "all" || stageFilter === s);
  const offTrackTargets = OFF_TRACK.flatMap(s => byStage[s] ?? []);

  function handleDragStart(e: DragStartEvent) {
    const card = (e.active.data.current as { target: KanbanTarget })?.target;
    if (card) setActiveCard(card);
  }

  function handleDragOver(e: { over: { id: string } | null }) {
    setOverId(e.over?.id ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    setOverId(null);

    const card = (e.active.data.current as { target: KanbanTarget })?.target;
    if (!card || !e.over) return;

    const newStage = (e.over.id as string).replace("col-", "");
    if (newStage === card.currentStage) return;
    if (OFF_TRACK.includes(newStage)) return; // can't drag to off-track

    setPending({ target: card, newStage });
  }

  async function handleConfirmStageChange(reason: string) {
    if (!pending) return;
    setIsSaving(true);
    try {
      await changeStage.mutateAsync({
        id: pending.target.id,
        data: { newStage: pending.newStage, changeReason: reason },
      });
      toast({
        title: "Stage updated",
        description: `${pending.target.projectName ?? pending.target.targetCode} moved to ${pending.newStage}.`,
      });
      setPending(null);
      onRefresh?.();
    } catch {
      toast({
        title: "Stage change failed",
        description: "Could not update stage. The card has been returned to its original column.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  const [offTrackOpen, setOffTrackOpen] = useState(false);

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver as never}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 pt-1 min-h-[400px]">
          {/* Active stage columns */}
          {activeStages.map(stage => (
            <DroppableColumn
              key={stage}
              stage={stage}
              targets={byStage[stage] ?? []}
              aiMode={aiMode}
              isOver={overId === `col-${stage}`}
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
                    <DraggableCard key={t.id} target={t} isOffTrack />
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
              <DraggableCard target={activeCard} isDragging />
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
