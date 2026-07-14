import React, { useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, ListChecks, ExternalLink, ChevronLeft, CheckCircle2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateInteraction,
  getListTargetsQueryKey,
} from "@workspace/api-client-react";

const INTERACTION_TYPES = ["Call", "Meeting", "Email", "Site Visit", "Other"];
const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 8;

interface MobileLongPressTrayProps {
  targetId: number;
  targetName: string;
  targetCode?: string | null;
  targetHref: string;
  children: React.ReactNode;
  showViewActions?: boolean;
  onComplete?: () => void;
  onReopen?: () => void;
  isCompleted?: boolean;
  isCompletePending?: boolean;
}

export function MobileLongPressTray({
  targetId,
  targetName,
  targetCode,
  targetHref,
  children,
  showViewActions = true,
  onComplete,
  onReopen,
  isCompleted = false,
  isCompletePending = false,
}: MobileLongPressTrayProps) {
  const [, navigate] = useLocation();

  const [trayOpen, setTrayOpen] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);

  const [interactionType, setInteractionType] = useState("Call");
  const [summary, setSummary] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createInteraction = useCreateInteraction();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  function resetForm() {
    setInteractionType("Call");
    setSummary("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setShowLogForm(false);
  }

  function closeTray() {
    setTrayOpen(false);
    resetForm();
  }

  const cancelTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    longPressTriggeredRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setTrayOpen(true);
    }, LONG_PRESS_MS);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startPosRef.current) return;
      const dx = Math.abs(e.clientX - startPosRef.current.x);
      const dy = Math.abs(e.clientY - startPosRef.current.y);
      if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
        cancelTimer();
      }
    },
    [cancelTimer]
  );

  const handlePointerUp = useCallback(() => {
    cancelTimer();
    startPosRef.current = null;
  }, [cancelTimer]);

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (longPressTriggeredRef.current) {
      e.stopPropagation();
      e.preventDefault();
      longPressTriggeredRef.current = false;
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!summary.trim()) return;
    createInteraction.mutate(
      {
        id: targetId,
        data: {
          interactionType,
          summary: summary.trim(),
          interactionDatetime: new Date(date).toISOString(),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Interaction logged",
            description: `${interactionType} recorded for ${targetName}`,
          });
          queryClient.invalidateQueries({ queryKey: getListTargetsQueryKey() });
          closeTray();
        },
        onError: (err) => {
          toast({
            title: "Failed to log interaction",
            description:
              err instanceof Error ? err.message : "Please try again",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
        className="select-none"
      >
        {children}
      </div>

      <Sheet
        open={trayOpen}
        onOpenChange={(v) => {
          if (!v) closeTray();
        }}
      >
        <SheetContent
          side="bottom"
          className="p-0 rounded-t-2xl max-h-[80vh] overflow-y-auto"
        >
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
          </div>

          <div className="px-4 pb-3 border-b border-border/50">
            <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-foreground truncate">
              {targetName}
            </p>
            {targetCode && (
              <p className="text-[10px] font-mono text-muted-foreground/50 uppercase mt-0.5">
                {targetCode}
              </p>
            )}
          </div>

          {!showLogForm ? (
            <div className="px-3 py-3 pb-8 space-y-2">
              <button
                type="button"
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-primary/8 hover:bg-primary/12 active:bg-primary/18 transition-colors text-left"
                onClick={() => setShowLogForm(true)}
              >
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/15 shrink-0">
                  <MessageSquarePlus size={18} className="text-primary" />
                </span>
                <div>
                  <p className="text-sm font-medium">Log Interaction</p>
                  <p className="text-[11px] text-muted-foreground">
                    Record a call, meeting or email
                  </p>
                </div>
              </button>

              <button
                type="button"
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-muted/40 hover:bg-muted/70 active:bg-muted transition-colors text-left"
                onClick={() => {
                  closeTray();
                  navigate(targetHref);
                }}
              >
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-muted shrink-0">
                  <ExternalLink size={18} className="text-muted-foreground" />
                </span>
                <div>
                  <p className="text-sm font-medium">Open Deal</p>
                  <p className="text-[11px] text-muted-foreground">
                    Full detail view
                  </p>
                </div>
              </button>

              {showViewActions && (
                <button
                  type="button"
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-muted/40 hover:bg-muted/70 active:bg-muted transition-colors text-left"
                  onClick={() => {
                    closeTray();
                    navigate(`/targets/${targetId}?tab=actions`);
                  }}
                >
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-muted shrink-0">
                    <ListChecks size={18} className="text-muted-foreground" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">View Actions</p>
                    <p className="text-[11px] text-muted-foreground">
                      See open and overdue action items
                    </p>
                  </div>
                </button>
              )}

              {(onComplete || onReopen) && (
                isCompleted ? (
                  <button
                    type="button"
                    disabled={isCompletePending}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-muted/40 hover:bg-muted/70 active:bg-muted transition-colors text-left disabled:opacity-50"
                    onClick={() => {
                      onReopen?.();
                      closeTray();
                    }}
                  >
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-muted shrink-0">
                      <RotateCcw size={18} className="text-muted-foreground" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Reopen Action</p>
                      <p className="text-[11px] text-muted-foreground">
                        Mark this action as open again
                      </p>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isCompletePending}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-emerald-500/8 hover:bg-emerald-500/12 active:bg-emerald-500/18 transition-colors text-left disabled:opacity-50"
                    onClick={() => {
                      onComplete?.();
                      closeTray();
                    }}
                  >
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15 shrink-0">
                      <CheckCircle2 size={18} className="text-emerald-600" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">Mark Complete</p>
                      <p className="text-[11px] text-muted-foreground">
                        Close out this action item
                      </p>
                    </div>
                  </button>
                )
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="px-4 py-3 pb-8 space-y-3">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors mb-1"
              >
                <ChevronLeft size={13} />
                Back
              </button>

              <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-foreground">
                Log Interaction
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Date
                  </Label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-mono uppercase text-muted-foreground">
                    Type
                  </Label>
                  <Select
                    value={interactionType}
                    onValueChange={setInteractionType}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERACTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-mono uppercase text-muted-foreground">
                  Summary <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Brief notes on what was discussed…"
                  rows={3}
                  className="text-sm resize-none"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={closeTray}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={!summary.trim() || createInteraction.isPending}
                >
                  {createInteraction.isPending ? "Logging…" : "Log"}
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
