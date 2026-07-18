import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  useGetDiligenceForTarget, getGetDiligenceForTargetQueryKey,
  useCreateDiligenceItem,
  useUpdateAction,
  useDeleteAction,
  useGetDdSynthesis, getGetDdSynthesisQueryKey, useRunDdSynthesis,
  useGetAiRunHistory, getGetAiRunHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { SafeHtml } from "@/components/ui/safe-html";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, CheckCircle2, RotateCcw, Pencil, Trash2,
  ChevronDown, ChevronRight, ShieldCheck, Link2, X,
  Brain, Sparkles, AlertTriangle, Loader2, History,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const WORKSTREAMS = [
  "Commercial", "Financial", "Legal", "Tax",
  "HR", "Technology", "Operations", "Integration",
  "ESG", "Regulatory",
] as const;

const SEVERITY_COLORS: Record<string, string> = {
  High:   "bg-red-500/10 text-red-400 border-red-500/20",
  Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Low:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const WORKSTREAM_COLORS: Record<string, string> = {
  Commercial: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Financial: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Legal: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Tax: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  HR: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Technology: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Operations: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  Integration: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  ESG: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  Regulatory: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

const ACTION_PRIORITIES = ["Critical", "High", "Medium", "Low"];
const ACTION_STATUSES = ["Open", "In Progress", "Blocked", "Completed"];

type EvidenceLink = { label: string; url: string };

type DiligenceItem = {
  id: number;
  targetId: number;
  description: string;
  owner?: string | null;
  dueDate?: string | null;
  priority: string;
  status: string;
  workstream?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  evidenceLinks?: EvidenceLink[] | null;
};

type EditDilData = {
  id: number;
  workstream: string;
  description: string;
  owner: string;
  dueDate: string;
  priority: string;
  status: string;
  notes: string;
  evidenceLinks: EvidenceLink[];
};

function statusColor(status: string) {
  if (status === "Blocked") return "text-destructive";
  if (status === "Completed") return "text-emerald-500";
  if (status === "In Progress") return "text-primary";
  return "text-muted-foreground";
}

function priorityColor(priority: string) {
  if (priority === "Critical") return "text-destructive";
  if (priority === "High") return "text-amber-500";
  return "text-muted-foreground";
}

type WorkstreamSectionProps = {
  ws: string;
  items: DiligenceItem[];
  onEdit: (item: DiligenceItem) => void;
  onToggle: (id: number, status: string) => void;
  onDelete: (id: number) => void;
  isPending: boolean;
};

function WorkstreamSection({ ws, items, onEdit, onToggle, onDelete, isPending }: WorkstreamSectionProps) {
  const [open, setOpen] = useState(true);
  const cls = WORKSTREAM_COLORS[ws] ?? "bg-muted text-muted-foreground border-border";
  const completedCount = items.filter((i) => i.status === "Completed").length;

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 bg-card/30 hover:bg-card/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-sm ${cls}`}>{ws}</Badge>
          <span className="text-[10px] font-mono text-muted-foreground">
            {completedCount}/{items.length} done
          </span>
        </div>
        {open ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="divide-y divide-border bg-background/20">
          {items.length === 0 ? (
            <div className="px-3 py-4 text-center text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              No items — add one to start
            </div>
          ) : (
            items.map((item) => {
              const isCompleted = item.status === "Completed";
              const isOverdue =
                !isCompleted && item.dueDate && new Date(item.dueDate) < new Date(new Date().toDateString());
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-3 py-2.5 group hover:bg-card/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium leading-snug ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                      {item.description}
                    </div>
                    {item.notes && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 italic">
                        <SafeHtml html={item.notes} className="[&_p]:mb-0 [&_p:last-child]:mb-0 [&_ul]:my-0 [&_ol]:my-0 [&_li]:leading-snug" />
                      </div>
                    )}
                    {item.evidenceLinks && item.evidenceLinks.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.evidenceLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-sm border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <Link2 size={9} />
                            {link.label}
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-mono uppercase ${statusColor(item.status)}`}>{item.status}</span>
                      <span className={`text-[10px] font-mono uppercase ${priorityColor(item.priority)}`}>{item.priority}</span>
                      {item.owner && <span className="text-[10px] font-mono text-muted-foreground">{item.owner}</span>}
                      {item.dueDate && (
                        <span className={`text-[10px] font-mono ${isOverdue ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                          {isOverdue ? "⚠ " : ""}Due {format(parseISO(item.dueDate), "MMM d")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      onClick={() => onEdit(item)}
                    >
                      <Pencil size={11} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive/60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 size={11} />
                    </Button>
                    {isCompleted ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[9px] font-mono uppercase rounded-sm border-border text-muted-foreground px-2"
                        onClick={() => onToggle(item.id, item.status)}
                        disabled={isPending}
                      >
                        <RotateCcw size={10} className="mr-1" /> Reopen
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-6 text-[9px] font-mono uppercase rounded-sm bg-emerald-600 hover:bg-emerald-700 text-white px-2"
                        onClick={() => onToggle(item.id, item.status)}
                        disabled={isPending}
                      >
                        <CheckCircle2 size={10} className="mr-1" /> Done
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function DiligenceTab({ targetId }: { targetId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetDiligenceForTarget(targetId, {
    query: { enabled: !!targetId, queryKey: getGetDiligenceForTargetQueryKey(targetId) },
  });

  const createDiligenceItem = useCreateDiligenceItem();
  const updateAction = useUpdateAction();
  const deleteAction = useDeleteAction();

  const [addOpen, setAddOpen] = useState(false);
  const [addWorkstream, setAddWorkstream] = useState<string>("Commercial");
  const [addDesc, setAddDesc] = useState("");
  const [addOwner, setAddOwner] = useState("");
  const [addDueDate, setAddDueDate] = useState("");
  const [addPriority, setAddPriority] = useState("Medium");
  const [addStatus, setAddStatus] = useState("Open");
  const [addNotes, setAddNotes] = useState("");
  const [addLinks, setAddLinks] = useState<EvidenceLink[]>([]);
  const [addLinkLabel, setAddLinkLabel] = useState("");
  const [addLinkUrl, setAddLinkUrl] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<EditDilData>({
    id: 0, workstream: "Commercial", description: "", owner: "",
    dueDate: "", priority: "Medium", status: "Open", notes: "", evidenceLinks: [],
  });
  const [editLinkLabel, setEditLinkLabel] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: ddData, isLoading: loadingDd } = useGetDdSynthesis(targetId, {
    query: { enabled: !!targetId, queryKey: getGetDdSynthesisQueryKey(targetId) },
  });
  const runDd = useRunDdSynthesis();

  const [ddHistoryOpen, setDdHistoryOpen] = useState(false);
  const [ddExpandedId, setDdExpandedId] = useState<number | null>(null);
  const { data: ddHistory } = useGetAiRunHistory(targetId, { phase: "dd-synthesis", limit: 20 }, {
    query: { enabled: !!targetId && ddHistoryOpen, queryKey: getGetAiRunHistoryQueryKey(targetId, { phase: "dd-synthesis", limit: 20 }) },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetDiligenceForTargetQueryKey(targetId) });
  const invalidateDd = () =>
    queryClient.invalidateQueries({ queryKey: getGetDdSynthesisQueryKey(targetId) });

  const handleRunDd = () => {
    runDd.mutate(
      { targetId },
      {
        onSuccess: () => { invalidateDd(); },
        onError: () => toast({ title: "AI Error", description: "Could not run DD synthesis", variant: "destructive" }),
      },
    );
  };

  const resetAddForm = () => {
    setAddWorkstream("Commercial");
    setAddDesc(""); setAddOwner(""); setAddDueDate("");
    setAddPriority("Medium"); setAddStatus("Open"); setAddNotes("");
    setAddLinks([]); setAddLinkLabel(""); setAddLinkUrl("");
  };

  const handleAddLink = () => {
    if (!addLinkLabel.trim() || !addLinkUrl.trim()) return;
    const url = addLinkUrl.trim().startsWith("http") ? addLinkUrl.trim() : `https://${addLinkUrl.trim()}`;
    setAddLinks((prev) => [...prev, { label: addLinkLabel.trim(), url }]);
    setAddLinkLabel(""); setAddLinkUrl("");
  };

  const handleEditAddLink = () => {
    if (!editLinkLabel.trim() || !editLinkUrl.trim()) return;
    const url = editLinkUrl.trim().startsWith("http") ? editLinkUrl.trim() : `https://${editLinkUrl.trim()}`;
    setEditData((d) => ({ ...d, evidenceLinks: [...d.evidenceLinks, { label: editLinkLabel.trim(), url }] }));
    setEditLinkLabel(""); setEditLinkUrl("");
  };

  const handleAdd = () => {
    if (!addDesc.trim()) return;
    createDiligenceItem.mutate(
      {
        id: targetId,
        data: {
          workstream: addWorkstream,
          description: addDesc,
          owner: addOwner || null,
          dueDate: addDueDate || null,
          priority: addPriority,
          status: addStatus,
          notes: addNotes || null,
          evidenceLinks: addLinks.length > 0 ? addLinks : null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Diligence Item Added" });
          setAddOpen(false); resetAddForm(); invalidate();
        },
        onError: () => toast({ title: "Error", description: "Could not add item", variant: "destructive" }),
      },
    );
  };

  const openEdit = (item: DiligenceItem) => {
    setEditData({
      id: item.id,
      workstream: item.workstream ?? "Commercial",
      description: item.description ?? "",
      owner: item.owner ?? "",
      dueDate: item.dueDate ?? "",
      priority: item.priority ?? "Medium",
      status: item.status ?? "Open",
      notes: item.notes ?? "",
      evidenceLinks: item.evidenceLinks ?? [],
    });
    setEditLinkLabel(""); setEditLinkUrl("");
    setEditOpen(true);
  };

  const handleEdit = () => {
    updateAction.mutate(
      {
        id: editData.id,
        data: {
          workstream: editData.workstream || undefined,
          description: editData.description || undefined,
          owner: editData.owner || null,
          dueDate: editData.dueDate || null,
          priority: editData.priority || undefined,
          status: editData.status || undefined,
          notes: editData.notes || null,
          evidenceLinks: editData.evidenceLinks.length > 0 ? editData.evidenceLinks : null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Item Updated" });
          setEditOpen(false); invalidate();
        },
        onError: () => toast({ title: "Error", description: "Could not update item", variant: "destructive" }),
      },
    );
  };

  const handleToggle = (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "Completed" ? "Open" : "Completed";
    updateAction.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: newStatus === "Completed" ? "Marked Complete" : "Reopened" });
          invalidate();
        },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      },
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteAction.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Item Deleted" });
          setDeleteOpen(false); setDeleteId(null); invalidate();
        },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      },
    );
  };

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const items = data?.items ?? [];
  const readiness = data?.readiness ?? { total: 0, completed: 0, blocked: 0, overdue: 0, missingWorkstreams: [...WORKSTREAMS] };
  const pct = readiness.total > 0 ? Math.round((readiness.completed / readiness.total) * 100) : 0;

  const itemsByWs = new Map<string, DiligenceItem[]>();
  for (const ws of WORKSTREAMS) itemsByWs.set(ws, []);
  for (const item of items) {
    const ws = item.workstream ?? "Commercial";
    if (!itemsByWs.has(ws)) itemsByWs.set(ws, []);
    itemsByWs.get(ws)!.push(item);
  }

  return (
    <div className="space-y-4">
      {/* Readiness Score */}
      <Card className="bg-card/30 border-border rounded-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary" />
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Diligence Readiness</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-sm font-mono text-[10px] uppercase border-border gap-1"
              onClick={() => setAddOpen(true)}
            >
              <Plus size={12} /> Add Item
            </Button>
          </div>
          <div className="flex items-end gap-4 mb-3">
            <div className={`text-4xl font-mono font-bold ${pct === 100 ? "text-emerald-500" : pct >= 60 ? "text-primary" : pct >= 30 ? "text-amber-500" : "text-destructive"}`}>
              {pct}%
            </div>
            <div className="text-sm text-muted-foreground mb-1">
              {readiness.completed} of {readiness.total} items complete
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-primary" : pct >= 30 ? "bg-amber-500" : "bg-destructive"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-4 text-[10px] font-mono">
            {readiness.blocked > 0 && (
              <span className="text-destructive">{readiness.blocked} blocked</span>
            )}
            {readiness.overdue > 0 && (
              <span className="text-amber-500">{readiness.overdue} overdue</span>
            )}
            {readiness.missingWorkstreams.length > 0 && (
              <span className="text-muted-foreground">
                Missing: {readiness.missingWorkstreams.join(", ")}
              </span>
            )}
            {pct === 100 && (
              <span className="text-emerald-500">All workstreams complete</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI DD Synthesis */}
      {(() => {
        const wsWithItems = [...itemsByWs.entries()].filter(([, wsItems]) => wsItems.length > 0).length;
        if (wsWithItems < 3) return null;
        return (
          <Card className="bg-card/30 border-border rounded-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain size={16} className="text-primary" />
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">AI Risk Synthesis</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-sm font-mono text-[10px] uppercase border-border gap-1"
                  disabled={runDd.isPending}
                  onClick={handleRunDd}
                >
                  {runDd.isPending
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Sparkles size={11} />}
                  {ddData?.result ? "Re-run" : "Run Synthesis"}
                </Button>
              </div>

              {loadingDd ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : !ddData?.result ? (
                <div className="border border-dashed border-border rounded-sm py-8 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
                  No synthesis yet — click Run Synthesis above
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary */}
                  <p className="text-xs text-foreground/80 leading-relaxed border-l-2 border-primary/40 pl-3 italic">
                    {ddData.result.summaryNote}
                  </p>

                  {/* Top risks */}
                  {ddData.result.risks.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <AlertTriangle size={10} />
                        Top Risks
                      </div>
                      {ddData.result.risks.map((risk) => (
                        <div
                          key={risk.rank}
                          className="p-2.5 rounded-sm border border-border bg-background/20 space-y-1.5"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-mono text-muted-foreground/60 tabular-nums">#{risk.rank}</span>
                            <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-sm ${SEVERITY_COLORS[risk.severity] ?? "bg-muted text-muted-foreground border-border"}`}>
                              {risk.severity}
                            </Badge>
                            <Badge variant="outline" className="font-mono text-[9px] uppercase rounded-sm bg-muted/30 text-muted-foreground border-border">
                              {risk.workstream}
                            </Badge>
                          </div>
                          <p className="text-xs text-foreground/80">{risk.description}</p>
                          <p className="text-[10px] text-muted-foreground/70 italic">→ {risk.mitigation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Patterns */}
                  {ddData.result.patterns.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Cross-Workstream Patterns</div>
                      <ul className="space-y-1">
                        {ddData.result.patterns.map((p, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="mt-0.5 text-primary shrink-0">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {ddData.result.runAt && (
                    <div className="text-[10px] font-mono text-muted-foreground/50 text-right">
                      Generated {format(parseISO(ddData.result.runAt), "MMM d · HH:mm")}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* AI DD Synthesis History */}
      {(() => {
        const wsWithItems = [...itemsByWs.entries()].filter(([, wsItems]) => wsItems.length > 0).length;
        if (wsWithItems < 3) return null;
        return (
          <div className="rounded-sm border border-border bg-card/20 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-card/40 transition-colors"
              onClick={() => { setDdHistoryOpen((v) => !v); setDdExpandedId(null); }}
            >
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <History size={12} />
                Risk Synthesis History
              </div>
              {ddHistoryOpen ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
            </button>
            {ddHistoryOpen && (
              <div className="border-t border-border divide-y divide-border/50">
                {!ddHistory || ddHistory.runs.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    No previous runs recorded
                  </div>
                ) : (
                  ddHistory.runs.map((run, idx) => {
                    type DdRunOutput = { risks?: Array<{ rank: number; severity: string; workstream: string; description: string; mitigation: string }>; patterns?: string[]; summaryNote?: string; runAt?: string };
                    const out = run.outputJson as DdRunOutput;
                    const topSeverity = out.risks?.[0]?.severity;
                    const isExpanded = ddExpandedId === run.id;
                    const isLatest = idx === 0;
                    return (
                      <div key={run.id} className="bg-background/10">
                        <button
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-card/30 transition-colors text-left"
                          onClick={() => setDdExpandedId(isExpanded ? null : run.id)}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            {isLatest && (
                              <span className="text-[9px] font-mono uppercase text-primary/70 border border-primary/30 px-1 rounded-sm">Latest</span>
                            )}
                            {topSeverity && (
                              <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-sm ${SEVERITY_COLORS[topSeverity] ?? "bg-muted text-muted-foreground border-border"}`}>
                                Top risk: {topSeverity}
                              </Badge>
                            )}
                            {out.risks && (
                              <span className="text-[9px] font-mono text-muted-foreground/60">{out.risks.length} risk{out.risks.length !== 1 ? "s" : ""}</span>
                            )}
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {format(parseISO(run.createdAt), "MMM d, yyyy · HH:mm")}
                            </span>
                            {run.model && (
                              <span className="text-[9px] font-mono text-muted-foreground/50">{run.model}</span>
                            )}
                          </div>
                          {isExpanded ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-3 bg-background/20">
                            {out.summaryNote && (
                              <p className="text-xs text-foreground/80 leading-relaxed border-l-2 border-primary/40 pl-3 italic">{out.summaryNote}</p>
                            )}
                            {out.risks && out.risks.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                  <AlertTriangle size={9} /> Top Risks
                                </div>
                                {out.risks.map((risk) => (
                                  <div key={risk.rank} className="p-2 rounded-sm border border-border bg-background/20 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[9px] font-mono text-muted-foreground/60 tabular-nums">#{risk.rank}</span>
                                      <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-sm ${SEVERITY_COLORS[risk.severity] ?? "bg-muted text-muted-foreground border-border"}`}>
                                        {risk.severity}
                                      </Badge>
                                      <Badge variant="outline" className="font-mono text-[9px] uppercase rounded-sm bg-muted/30 text-muted-foreground border-border">
                                        {risk.workstream}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-foreground/80">{risk.description}</p>
                                    <p className="text-[10px] text-muted-foreground/70 italic">→ {risk.mitigation}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {out.patterns && out.patterns.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Patterns</div>
                                <ul className="space-y-0.5">
                                  {out.patterns.map((p, i) => (
                                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                      <span className="text-primary shrink-0 mt-0.5">•</span><span>{p}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {run.tokensUsed != null && (
                              <div className="text-[9px] font-mono text-muted-foreground/40 text-right">{run.tokensUsed} tokens</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Workstream Sections */}
      <div className="space-y-2">
        {WORKSTREAMS.map((ws) => (
          <WorkstreamSection
            key={ws}
            ws={ws}
            items={itemsByWs.get(ws) ?? []}
            onEdit={openEdit}
            onToggle={handleToggle}
            onDelete={(id) => { setDeleteId(id); setDeleteOpen(true); }}
            isPending={updateAction.isPending}
          />
        ))}
      </div>

      {/* Add Diligence Item Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) resetAddForm(); setAddOpen(o); }}>
        <DialogContent className="sm:max-w-[540px] border-border bg-sidebar rounded-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-sans font-semibold text-lg">Add Diligence Item</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Workstream <span className="text-destructive">*</span></label>
              <Select value={addWorkstream} onValueChange={setAddWorkstream}>
                <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-sm">
                  {WORKSTREAMS.map((ws) => <SelectItem key={ws} value={ws}>{ws}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Title / Description <span className="text-destructive">*</span></label>
              <Input
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                className="rounded-sm bg-background/50"
                placeholder="What needs to be done?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Priority</label>
                <Select value={addPriority} onValueChange={setAddPriority}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">
                    {ACTION_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Status</label>
                <Select value={addStatus} onValueChange={setAddStatus}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">
                    {ACTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Due Date</label>
                <Input type="date" value={addDueDate} onChange={(e) => setAddDueDate(e.target.value)} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Owner</label>
                <Input value={addOwner} onChange={(e) => setAddOwner(e.target.value)} className="rounded-sm bg-background/50" placeholder="Name or team" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Notes</label>
              <RichTextEditor value={addNotes} onChange={setAddNotes} placeholder="Optional context or blockers…" maxLength={5000} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Evidence Links</label>
              {addLinks.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {addLinks.map((link, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-sm border border-primary/30 bg-primary/10 text-primary">
                      <Link2 size={9} />{link.label}
                      <button onClick={() => setAddLinks((prev) => prev.filter((_, j) => j !== i))} className="ml-0.5 hover:text-destructive">
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={addLinkLabel}
                  onChange={(e) => setAddLinkLabel(e.target.value)}
                  className="rounded-sm bg-background/50 text-xs h-8"
                  placeholder="Label (e.g. Data Room)"
                />
                <Input
                  value={addLinkUrl}
                  onChange={(e) => setAddLinkUrl(e.target.value)}
                  className="rounded-sm bg-background/50 text-xs h-8"
                  placeholder="URL"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddLink(); } }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 rounded-sm shrink-0"
                  onClick={handleAddLink}
                  disabled={!addLinkLabel.trim() || !addLinkUrl.trim()}
                >
                  <Plus size={12} />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetAddForm(); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button onClick={handleAdd} disabled={!addDesc.trim() || createDiligenceItem.isPending} className="rounded-sm font-mono uppercase text-[10px]">Add Item</Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Diligence Item Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[540px] border-border bg-sidebar rounded-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-sans font-semibold text-lg">Edit Diligence Item</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Workstream</label>
              <Select value={editData.workstream} onValueChange={(v) => setEditData((d) => ({ ...d, workstream: v }))}>
                <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-sm">
                  {WORKSTREAMS.map((ws) => <SelectItem key={ws} value={ws}>{ws}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Title / Description <span className="text-destructive">*</span></label>
              <Input
                value={editData.description}
                onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))}
                className="rounded-sm bg-background/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Priority</label>
                <Select value={editData.priority} onValueChange={(v) => setEditData((d) => ({ ...d, priority: v }))}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">{ACTION_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Status</label>
                <Select value={editData.status} onValueChange={(v) => setEditData((d) => ({ ...d, status: v }))}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">{ACTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Due Date</label>
                <Input type="date" value={editData.dueDate} onChange={(e) => setEditData((d) => ({ ...d, dueDate: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Owner</label>
                <Input value={editData.owner} onChange={(e) => setEditData((d) => ({ ...d, owner: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Notes</label>
              <RichTextEditor value={editData.notes} onChange={(html) => setEditData((d) => ({ ...d, notes: html }))} maxLength={5000} />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Evidence Links</label>
              {editData.evidenceLinks.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {editData.evidenceLinks.map((link, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-sm border border-primary/30 bg-primary/10 text-primary">
                      <Link2 size={9} />{link.label}
                      <button onClick={() => setEditData((d) => ({ ...d, evidenceLinks: d.evidenceLinks.filter((_, j) => j !== i) }))} className="ml-0.5 hover:text-destructive">
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={editLinkLabel}
                  onChange={(e) => setEditLinkLabel(e.target.value)}
                  className="rounded-sm bg-background/50 text-xs h-8"
                  placeholder="Label (e.g. Data Room)"
                />
                <Input
                  value={editLinkUrl}
                  onChange={(e) => setEditLinkUrl(e.target.value)}
                  className="rounded-sm bg-background/50 text-xs h-8"
                  placeholder="URL"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleEditAddLink(); } }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 rounded-sm shrink-0"
                  onClick={handleEditAddLink}
                  disabled={!editLinkLabel.trim() || !editLinkUrl.trim()}
                >
                  <Plus size={12} />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button onClick={handleEdit} disabled={!editData.description.trim() || updateAction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save Changes</Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!o) setDeleteId(null); setDeleteOpen(o); }}>
        <DialogContent className="sm:max-w-[400px] border-destructive bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-sans font-semibold text-lg text-destructive">Delete Diligence Item</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">This will permanently remove the diligence item. This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteId(null); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteAction.isPending} className="rounded-sm font-mono uppercase text-[10px]">Delete</Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
