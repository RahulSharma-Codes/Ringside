import React, { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";
import { format } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateInteraction,
  getListTargetsQueryKey,
} from "@workspace/api-client-react";

const INTERACTION_TYPES = ["Call", "Meeting", "Email", "Site Visit", "Other"];

interface QuickLogInteractionPopoverProps {
  targetId: number;
  targetName: string;
  onSuccess?: () => void;
}

export function QuickLogInteractionPopover({
  targetId,
  targetName,
  onSuccess,
}: QuickLogInteractionPopoverProps) {
  const [open, setOpen] = useState(false);
  const [interactionType, setInteractionType] = useState("Call");
  const [summary, setSummary] = useState("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createInteraction = useCreateInteraction();

  function resetForm() {
    setInteractionType("Call");
    setSummary("");
    setDate(format(new Date(), "yyyy-MM-dd"));
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

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
          toast({ title: "Interaction logged", description: `${interactionType} recorded for ${targetName}` });
          queryClient.invalidateQueries({ queryKey: getListTargetsQueryKey() });
          setOpen(false);
          resetForm();
          onSuccess?.();
        },
        onError: (err) => {
          toast({
            title: "Failed to log interaction",
            description: err instanceof Error ? err.message : "Please try again",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <motion.button
          whileTap={{ scale: 0.9 }}
          aria-label={`Log interaction for ${targetName}`}
          title="Quick-log interaction"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <MessageSquarePlus size={14} />
        </motion.button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-4"
        align="start"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3">
          <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-foreground">Quick Log</p>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{targetName}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-mono uppercase text-muted-foreground">Date</Label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-mono uppercase text-muted-foreground">Type</Label>
              <Select value={interactionType} onValueChange={setInteractionType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERACTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-mono uppercase text-muted-foreground">Summary <span className="text-destructive">*</span></Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief notes on what was discussed…"
              rows={2}
              className="text-xs resize-none"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px] font-mono"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button
                type="submit"
                size="sm"
                className="h-7 text-[11px] font-mono"
                disabled={!summary.trim() || createInteraction.isPending}
              >
                {createInteraction.isPending ? "Logging…" : "Log"}
              </Button>
            </motion.div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
