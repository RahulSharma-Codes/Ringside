import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListActions, getListActionsQueryKey,
  useCreateAction,
  useUpdateAction,
  useDeleteAction,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { SafeHtml } from "@/components/ui/safe-html";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, CheckCircle2, RotateCcw } from "lucide-react";
import { format, parseISO } from "date-fns";

const ACTION_PRIORITIES = ["Critical", "High", "Medium", "Low"];
const ACTION_STATUSES = ["Open", "In Progress", "Blocked", "Completed"];

type EditActionData = {
  id: number;
  description: string;
  owner: string;
  dueDate: string;
  priority: string;
  status: string;
};

// ── ActionRow sub-component ───────────────────────────────────────────────────

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
          <SafeHtml html={action.description} className="[&_p]:mb-0.5 [&_p:last-child]:mb-0 [&_ul]:my-0.5 [&_ol]:my-0.5" />
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

// ── Public Tab Component ──────────────────────────────────────────────────────

interface ActionsTabProps {
  targetId: number;
  addOpen: boolean;
  onAddOpenChange: (v: boolean) => void;
}

export function ActionsTab({ targetId, addOpen, onAddOpenChange }: ActionsTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: actions, isLoading: loadingActions } = useListActions(targetId, {
    query: { enabled: !!targetId, queryKey: getListActionsQueryKey(targetId) },
  });

  const createAction = useCreateAction();
  const updateAction = useUpdateAction();
  const deleteAction = useDeleteAction();

  const invalidateActions = () => qc.invalidateQueries({ queryKey: getListActionsQueryKey(targetId) });

  // Add form state
  const [actionOpen, setActionOpen] = useState(false);
  const [actionDesc, setActionDesc] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [actionDueDate, setActionDueDate] = useState("");
  const [actionPriority, setActionPriority] = useState("Medium");

  // Edit state
  const [editActionOpen, setEditActionOpen] = useState(false);
  const [editActionData, setEditActionData] = useState<EditActionData>({
    id: 0,
    description: "",
    owner: "",
    dueDate: "",
    priority: "Medium",
    status: "Open",
  });

  // Delete state
  const [deleteActionOpen, setDeleteActionOpen] = useState(false);
  const [deleteActionId, setDeleteActionId] = useState<number | null>(null);

  // Bridge: parent mobile bar can trigger add dialog
  useEffect(() => {
    if (addOpen) {
      setActionOpen(true);
      onAddOpenChange(false);
    }
  }, [addOpen, onAddOpenChange]);

  const resetActionForm = () => {
    setActionDesc("");
    setActionOwner("");
    setActionDueDate("");
    setActionPriority("Medium");
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
          setEditActionOpen(false);
          invalidateActions();
          qc.invalidateQueries({ queryKey: ["actions-command-center"] });
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
          qc.invalidateQueries({ queryKey: ["actions-command-center"] });
        },
        onError: () => toast({ title: "Error", description: "Could not update action", variant: "destructive" }),
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

  const openActions = (actions ?? []).filter((a) => a.status !== "Completed");
  const completedActions = (actions ?? []).filter((a) => a.status === "Completed");

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
            <Button
              size="sm"
              variant="outline"
              className="hidden md:flex rounded-sm font-mono text-[10px] uppercase border-border"
              onClick={() => setActionOpen(true)}
            >
              <Plus size={13} className="mr-1" /> Add Action
            </Button>
          </motion.div>
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
                    <ActionRow
                      key={action.id}
                      action={action}
                      onEdit={() => openEditAction(action)}
                      onToggle={() => handleToggleActionComplete(action.id, action.status)}
                      onDelete={() => { setDeleteActionId(action.id); setDeleteActionOpen(true); }}
                      isPending={updateAction.isPending}
                    />
                  ))}
                </div>
              </div>
            )}
            {completedActions.length > 0 && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Completed ({completedActions.length})</div>
                <div className="space-y-2 opacity-60">
                  {completedActions.map((action) => (
                    <ActionRow
                      key={action.id}
                      action={action}
                      onEdit={() => openEditAction(action)}
                      onToggle={() => handleToggleActionComplete(action.id, action.status)}
                      onDelete={() => { setDeleteActionId(action.id); setDeleteActionOpen(true); }}
                      isPending={updateAction.isPending}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Action Dialog */}
      <Dialog open={actionOpen} onOpenChange={(open) => { if (!open) resetActionForm(); setActionOpen(open); }}>
        <DialogContent className="sm:max-w-[500px] border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-sans font-semibold text-lg">Add Action Item</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Description <span className="text-destructive">*</span></label>
              <RichTextEditor value={actionDesc} onChange={setActionDesc} placeholder="What needs to be done?" maxLength={5000} />
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
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button onClick={handleCreateAction} disabled={!actionDesc || createAction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Add Action</Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Action Dialog */}
      <Dialog open={editActionOpen} onOpenChange={setEditActionOpen}>
        <DialogContent className="sm:max-w-[500px] border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-sans font-semibold text-lg">Edit Action Item</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Description <span className="text-destructive">*</span></label>
              <RichTextEditor value={editActionData.description} onChange={(html) => setEditActionData((d) => ({ ...d, description: html }))} maxLength={5000} />
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
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button onClick={handleUpdateAction} disabled={!editActionData.description || updateAction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save Changes</Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Action Dialog */}
      <Dialog open={deleteActionOpen} onOpenChange={(open) => { if (!open) setDeleteActionId(null); setDeleteActionOpen(open); }}>
        <DialogContent className="sm:max-w-[400px] border-destructive bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-sans font-semibold text-lg text-destructive">Delete Action</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will permanently remove the action item. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteActionOpen(false); setDeleteActionId(null); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button variant="destructive" onClick={handleDeleteAction} disabled={deleteAction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Delete</Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
