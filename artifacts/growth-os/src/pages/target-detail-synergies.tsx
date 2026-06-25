import React, { useState } from "react";
import {
  useListSynergies, getListSynergiesQueryKey,
  useCreateSynergy,
  useUpdateSynergy,
  useDeleteSynergy,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Pencil, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Constants ─────────────────────────────────────────────────────────────────

const SYNERGY_TYPES    = ["Revenue", "Cost", "Capital", "Tax"] as const;
const CONFIDENCE_TIERS = ["Probable", "Possible", "Aspirational"] as const;
const REALISATION_STATUSES = ["Not Started", "On Track", "Slipping", "Realised"] as const;

type SynergyType = typeof SYNERGY_TYPES[number];
type SynergyEntry = {
  id: number;
  targetId: number;
  type: string;
  description: string;
  fy1?: string | null;
  fy2?: string | null;
  fy3?: string | null;
  fy4?: string | null;
  fy5?: string | null;
  oneTimeCost?: string | null;
  confidence: string;
  ownerName?: string | null;
  realisationStartMonth?: string | null;
  realisationStatus: string;
  isDisynergy: boolean;
};

const TYPE_COLORS: Record<SynergyType, string> = {
  Revenue:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  Cost:     "bg-blue-500/10 text-blue-400 border-blue-500/25",
  Capital:  "bg-violet-500/10 text-violet-400 border-violet-500/25",
  Tax:      "bg-amber-500/10 text-amber-400 border-amber-500/25",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  Probable:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  Possible:    "bg-amber-500/10 text-amber-400 border-amber-500/25",
  Aspirational:"bg-muted text-muted-foreground/60 border-border/40",
};

const STATUS_COLORS: Record<string, string> = {
  "Not Started": "text-muted-foreground/50",
  "On Track":    "text-emerald-400",
  "Slipping":    "text-amber-400",
  "Realised":    "text-blue-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFy(v: string | null | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function fmt(v: string | null | undefined): string {
  if (!v) return "—";
  const n = parseFy(v);
  if (n === 0) return "—";
  return n.toLocaleString("en", { maximumFractionDigits: 1 });
}

function totalFy(e: SynergyEntry): number {
  return [e.fy1, e.fy2, e.fy3, e.fy4, e.fy5].reduce((s, v) => s + parseFy(v), 0);
}

// Simple inline FY bar mini-chart using CSS
function FySparkline({ entry }: { entry: SynergyEntry }) {
  const fys = [
    { label: "FY1", v: parseFy(entry.fy1) },
    { label: "FY2", v: parseFy(entry.fy2) },
    { label: "FY3", v: parseFy(entry.fy3) },
    { label: "FY4", v: parseFy(entry.fy4) },
    { label: "FY5", v: parseFy(entry.fy5) },
  ];
  const max = Math.max(...fys.map((f) => Math.abs(f.v)), 1);
  const sign = entry.isDisynergy ? -1 : 1;

  return (
    <div className="flex items-end gap-1 h-8">
      {fys.map(({ label, v }) => {
        const pct = Math.round((Math.abs(v) / max) * 100);
        const color = entry.isDisynergy
          ? "bg-destructive/50"
          : v === 0 ? "bg-border/40" : "bg-primary/60";
        return (
          <div key={label} className="flex flex-col items-center gap-0.5 flex-1">
            <div className="w-full flex flex-col justify-end" style={{ height: 28 }}>
              <div className={`w-full rounded-sm ${color}`} style={{ height: `${pct}%`, minHeight: v ? 2 : 0 }} />
            </div>
            <span className="text-[7px] font-mono text-muted-foreground/40">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ entries }: { entries: SynergyEntry[] }) {
  const synergies  = entries.filter((e) => !e.isDisynergy);
  const disynergies = entries.filter((e) => e.isDisynergy);
  const totalSyn   = synergies.reduce((s, e) => s + totalFy(e), 0);
  const totalDisyn = disynergies.reduce((s, e) => s + totalFy(e), 0);
  const net        = totalSyn - totalDisyn;
  const totalCost  = entries.reduce((s, e) => s + parseFy(e.oneTimeCost), 0);
  const byConf: Record<string, number> = {};
  for (const e of synergies) byConf[e.confidence] = (byConf[e.confidence] ?? 0) + 1;

  return (
    <Card className="bg-card border-border/70 rounded-xl">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Synergy Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-0.5">
            <div className="text-[9px] font-mono uppercase text-muted-foreground/60">Total Synergy (5yr)</div>
            <div className="text-base font-bold font-mono text-emerald-400">
              {totalSyn > 0 ? totalSyn.toLocaleString("en", { maximumFractionDigits: 1 }) : "—"}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[9px] font-mono uppercase text-muted-foreground/60">Net (excl. dis-syn)</div>
            <div className={`text-base font-bold font-mono ${net >= 0 ? "text-emerald-400" : "text-destructive"}`}>
              {net !== 0 ? net.toLocaleString("en", { maximumFractionDigits: 1 }) : "—"}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[9px] font-mono uppercase text-muted-foreground/60">One-Time Cost</div>
            <div className="text-base font-bold font-mono text-amber-400">
              {totalCost > 0 ? totalCost.toLocaleString("en", { maximumFractionDigits: 1 }) : "—"}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[9px] font-mono uppercase text-muted-foreground/60">By Confidence</div>
            <div className="flex gap-1 flex-wrap mt-0.5">
              {CONFIDENCE_TIERS.map((c) => byConf[c] ? (
                <Badge key={c} variant="outline" className={`font-mono text-[8px] px-1.5 ${CONFIDENCE_COLORS[c]}`}>
                  {c.slice(0, 4)} {byConf[c]}
                </Badge>
              ) : null)}
              {Object.keys(byConf).length === 0 && <span className="text-[10px] font-mono text-muted-foreground/40">—</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Entry card ────────────────────────────────────────────────────────────────

function EntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: SynergyEntry;
  onEdit: (e: SynergyEntry) => void;
  onDelete: (e: SynergyEntry) => void;
}) {
  const total = totalFy(entry);
  const typeColor = TYPE_COLORS[entry.type as SynergyType] ?? "bg-muted text-muted-foreground border-border";

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${entry.isDisynergy ? "border-destructive/25 bg-destructive/5" : "border-border/60 bg-card"}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`font-mono text-[9px] px-2 ${typeColor}`}>
            {entry.type}
          </Badge>
          {entry.isDisynergy && (
            <Badge variant="outline" className="font-mono text-[9px] px-2 bg-destructive/10 text-destructive border-destructive/25">
              <TrendingDown size={8} className="mr-1" /> Dis-synergy
            </Badge>
          )}
          <Badge variant="outline" className={`font-mono text-[9px] px-2 ${CONFIDENCE_COLORS[entry.confidence] ?? ""}`}>
            {entry.confidence}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(entry)} className="p-1 rounded hover:bg-muted/50 transition-colors">
            <Pencil size={12} className="text-muted-foreground/50 hover:text-muted-foreground" />
          </button>
          <button onClick={() => onDelete(entry)} className="p-1 rounded hover:bg-destructive/10 transition-colors">
            <Trash2 size={12} className="text-muted-foreground/50 hover:text-destructive" />
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-[12px] text-foreground/80 leading-relaxed">{entry.description}</p>

      {/* FY values + sparkline */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid grid-cols-5 gap-1">
          {(["fy1", "fy2", "fy3", "fy4", "fy5"] as const).map((fy, i) => (
            <div key={fy} className="text-center">
              <div className="text-[8px] font-mono text-muted-foreground/50 mb-0.5">FY{i + 1}</div>
              <div className={`text-[10px] font-mono font-medium ${parseFy(entry[fy]) !== 0 ? (entry.isDisynergy ? "text-destructive/80" : "text-foreground/80") : "text-muted-foreground/30"}`}>
                {fmt(entry[fy])}
              </div>
            </div>
          ))}
        </div>
        <FySparkline entry={entry} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/30">
        <div className="flex items-center gap-3 text-[10px] font-mono">
          {entry.ownerName && (
            <span className="text-muted-foreground/60">{entry.ownerName}</span>
          )}
          {entry.realisationStartMonth && (
            <span className="text-muted-foreground/50">Starts {entry.realisationStartMonth}</span>
          )}
          {entry.oneTimeCost && (
            <span className="text-muted-foreground/50">Cost: {fmt(entry.oneTimeCost)}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {entry.realisationStatus !== "Not Started" && (
            <span className={`text-[9px] font-mono uppercase tracking-wider ${STATUS_COLORS[entry.realisationStatus] ?? "text-muted-foreground/50"}`}>
              {entry.realisationStatus}
            </span>
          )}
          {total !== 0 && (
            <span className={`text-[11px] font-mono font-semibold ${entry.isDisynergy ? "text-destructive/80" : "text-emerald-400"}`}>
              {entry.isDisynergy ? "-" : "+"}{Math.abs(total).toLocaleString("en", { maximumFractionDigits: 1 })} total
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add/Edit dialog ───────────────────────────────────────────────────────────

type FormState = {
  type: string;
  description: string;
  fy1: string; fy2: string; fy3: string; fy4: string; fy5: string;
  oneTimeCost: string;
  confidence: string;
  ownerName: string;
  realisationStartMonth: string;
  realisationStatus: string;
  isDisynergy: boolean;
};

const EMPTY_FORM: FormState = {
  type: "Revenue",
  description: "",
  fy1: "", fy2: "", fy3: "", fy4: "", fy5: "",
  oneTimeCost: "",
  confidence: "Possible",
  ownerName: "",
  realisationStartMonth: "",
  realisationStatus: "Not Started",
  isDisynergy: false,
};

function entryToForm(e: SynergyEntry): FormState {
  return {
    type:                  e.type,
    description:           e.description,
    fy1:                   e.fy1 ?? "",
    fy2:                   e.fy2 ?? "",
    fy3:                   e.fy3 ?? "",
    fy4:                   e.fy4 ?? "",
    fy5:                   e.fy5 ?? "",
    oneTimeCost:           e.oneTimeCost ?? "",
    confidence:            e.confidence,
    ownerName:             e.ownerName ?? "",
    realisationStartMonth: e.realisationStartMonth ?? "",
    realisationStatus:     e.realisationStatus,
    isDisynergy:           e.isDisynergy,
  };
}

function SynergyDialog({
  open,
  editEntry,
  currentStage,
  onClose,
  targetId,
}: {
  open: boolean;
  editEntry: SynergyEntry | null;
  currentStage?: string;
  onClose: () => void;
  targetId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSynergy = useCreateSynergy();
  const updateSynergy = useUpdateSynergy();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  React.useEffect(() => {
    setForm(editEntry ? entryToForm(editEntry) : EMPTY_FORM);
  }, [editEntry, open]);

  const isClosingStage = ["Closing", "Closed", "Completed", "Signed"].includes(currentStage ?? "");
  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.description.trim() || !form.type) return;
    const payload = {
      type:                  form.type,
      description:           form.description.trim(),
      fy1:                   form.fy1 || null,
      fy2:                   form.fy2 || null,
      fy3:                   form.fy3 || null,
      fy4:                   form.fy4 || null,
      fy5:                   form.fy5 || null,
      oneTimeCost:           form.oneTimeCost || null,
      confidence:            form.confidence,
      ownerName:             form.ownerName || null,
      realisationStartMonth: form.realisationStartMonth || null,
      realisationStatus:     form.realisationStatus,
      isDisynergy:           form.isDisynergy,
    };

    try {
      if (editEntry) {
        await updateSynergy.mutateAsync({ id: editEntry.id, data: payload });
        toast({ title: "Synergy updated" });
      } else {
        await createSynergy.mutateAsync({ id: targetId, data: payload });
        toast({ title: "Synergy added" });
      }
      await queryClient.invalidateQueries({ queryKey: getListSynergiesQueryKey(targetId) });
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to save synergy", variant: "destructive" });
    }
  }

  const isSaving = createSynergy.isPending || updateSynergy.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[580px] border-border bg-sidebar rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-tight text-base">
            {editEntry ? "Edit Synergy" : "Add Synergy Hypothesis"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type + Is Dis-synergy */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Type</label>
              <Select value={form.type} onValueChange={(v) => setField("type", v)}>
                <SelectTrigger className="rounded-sm font-mono text-[11px] h-8 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYNERGY_TYPES.map((t) => <SelectItem key={t} value={t} className="font-mono text-[11px]">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Category</label>
              <div className="flex gap-2">
                {[false, true].map((isDis) => (
                  <button
                    key={String(isDis)}
                    type="button"
                    onClick={() => setField("isDisynergy", isDis)}
                    className={`flex-1 h-8 rounded-sm border font-mono text-[10px] uppercase tracking-wider transition-all ${
                      form.isDisynergy === isDis
                        ? isDis
                          ? "bg-destructive/20 border-destructive text-destructive font-semibold"
                          : "bg-primary/15 border-primary text-primary font-semibold"
                        : "bg-background/50 border-border/50 text-muted-foreground/60"
                    }`}
                  >
                    {isDis ? "Dis-syn" : "Synergy"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
              Description <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              className="rounded-sm bg-background/50 resize-none h-16 text-[12px]"
              placeholder="Describe the synergy hypothesis"
            />
          </div>

          {/* FY1–FY5 */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
              Annual Value (FY1 – FY5)
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(["fy1", "fy2", "fy3", "fy4", "fy5"] as const).map((fy, i) => (
                <div key={fy} className="space-y-1">
                  <div className="text-[8px] font-mono text-muted-foreground/50 text-center">FY{i + 1}</div>
                  <Input
                    value={form[fy]}
                    onChange={(e) => setField(fy, e.target.value)}
                    className="rounded-sm bg-background/50 h-8 text-[11px] font-mono text-center"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* One-time cost + Confidence */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">One-Time Cost</label>
              <Input
                value={form.oneTimeCost}
                onChange={(e) => setField("oneTimeCost", e.target.value)}
                className="rounded-sm bg-background/50 h-8 text-[11px] font-mono"
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Confidence</label>
              <Select value={form.confidence} onValueChange={(v) => setField("confidence", v)}>
                <SelectTrigger className="rounded-sm font-mono text-[11px] h-8 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIDENCE_TIERS.map((c) => <SelectItem key={c} value={c} className="font-mono text-[11px]">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Owner + Realisation start */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Owner</label>
              <Input
                value={form.ownerName}
                onChange={(e) => setField("ownerName", e.target.value)}
                className="rounded-sm bg-background/50 h-8 text-[11px] font-mono"
                placeholder="Name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Realisation Start</label>
              <Input
                value={form.realisationStartMonth}
                onChange={(e) => setField("realisationStartMonth", e.target.value)}
                className="rounded-sm bg-background/50 h-8 text-[11px] font-mono"
                placeholder="e.g. Q3 2026"
              />
            </div>
          </div>

          {/* Realisation status — only show post-closing */}
          {(isClosingStage || (editEntry && editEntry.realisationStatus !== "Not Started")) && (
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Realisation Status</label>
              <Select value={form.realisationStatus} onValueChange={(v) => setField("realisationStatus", v)}>
                <SelectTrigger className="rounded-sm font-mono text-[11px] h-8 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REALISATION_STATUSES.map((s) => <SelectItem key={s} value={s} className="font-mono text-[11px]">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!form.description.trim() || !form.type || isSaving}
            className="rounded-sm font-mono uppercase text-[10px]"
          >
            {isSaving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null}
            {editEntry ? "Save Changes" : "Add Synergy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SynergiesTab({ targetId, currentStage }: { targetId: number; currentStage?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteSynergy = useDeleteSynergy();

  const { data: entries, isLoading } = useListSynergies(targetId, {
    query: { queryKey: getListSynergiesQueryKey(targetId) },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<SynergyEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SynergyEntry | null>(null);

  function openAdd() { setEditEntry(null); setDialogOpen(true); }
  function openEdit(e: SynergyEntry) { setEditEntry(e); setDialogOpen(true); }
  function closeDialog() { setDialogOpen(false); setEditEntry(null); }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteSynergy.mutateAsync({ id: deleteTarget.id });
    await queryClient.invalidateQueries({ queryKey: getListSynergiesQueryKey(targetId) });
    toast({ title: "Synergy deleted" });
    setDeleteTarget(null);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const allEntries = entries ?? [];
  const synergies   = allEntries.filter((e) => !e.isDisynergy);
  const disynergies = allEntries.filter((e) => e.isDisynergy);

  // Group synergies by type
  const grouped = SYNERGY_TYPES.reduce<Record<string, typeof allEntries>>((acc, t) => {
    const group = synergies.filter((e) => e.type === t);
    if (group.length > 0) acc[t] = group;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Top action row */}
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg font-mono uppercase tracking-wider text-[10px] gap-1.5 border-border/60 h-7 px-2.5"
          onClick={openAdd}
        >
          <Plus size={11} /> Add Hypothesis
        </Button>
      </div>

      {allEntries.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl py-20 text-center">
          <TrendingUp size={24} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50">
            No synergy hypotheses recorded yet
          </p>
          <Button size="sm" variant="ghost" onClick={openAdd} className="mt-4 font-mono text-[10px] uppercase text-muted-foreground/60">
            Add the first one
          </Button>
        </div>
      ) : (
        <>
          {/* Summary */}
          <SummaryCard entries={allEntries} />

          {/* Synergies by type */}
          {Object.entries(grouped).map(([type, group]) => {
            const typeTotal = group.reduce((s, e) => s + totalFy(e), 0);
            return (
              <div key={type} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`font-mono text-[9px] px-2 ${TYPE_COLORS[type as SynergyType] ?? ""}`}>
                      {type}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground/60">{group.length} entr{group.length === 1 ? "y" : "ies"}</span>
                  </div>
                  {typeTotal > 0 && (
                    <span className="text-[10px] font-mono text-emerald-400/80">
                      Total: {typeTotal.toLocaleString("en", { maximumFractionDigits: 1 })}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {group.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} onEdit={openEdit} onDelete={setDeleteTarget} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Dis-synergies */}
          {disynergies.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-[9px] px-2 bg-destructive/10 text-destructive border-destructive/25">
                  <TrendingDown size={8} className="mr-1" /> Dis-synergies
                </Badge>
                <span className="text-[10px] font-mono text-muted-foreground/60">{disynergies.length} entr{disynergies.length === 1 ? "y" : "ies"}</span>
              </div>
              <div className="space-y-2">
                {disynergies.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} onEdit={openEdit} onDelete={setDeleteTarget} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit dialog */}
      <SynergyDialog
        open={dialogOpen}
        editEntry={editEntry}
        currentStage={currentStage}
        onClose={closeDialog}
        targetId={targetId}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="border-border bg-sidebar rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono uppercase tracking-tight text-base">Delete Synergy?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-[11px]">
              "{deleteTarget?.description}" will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm font-mono uppercase text-[10px]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-sm font-mono uppercase text-[10px] bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
