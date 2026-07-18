import React, { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSynergies,
  getListSynergiesQueryKey,  useCreateSynergy,
  useUpdateSynergy,
  useDeleteSynergy,
} from "@workspace/api-client-react";
import type { Synergy } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, AlertTriangle, Lock } from "lucide-react";
import { PIPELINE_STAGE_ORDER } from "@/components/stage-rail";

const SYNERGY_TYPES = ["Revenue", "Cost", "Capital", "Tax"] as const;
const CONFIDENCES = ["Probable", "Possible", "Aspirational"] as const;
const STATUSES = ["Not Started", "On Track", "Slipping", "Realised"] as const;

type SynergyType = (typeof SYNERGY_TYPES)[number];
type Confidence = (typeof CONFIDENCES)[number];
type Status = (typeof STATUSES)[number];

// Realisation status becomes available at the "Closing" stage and all later stages.
// "Closing" is stage index 11 in PIPELINE_STAGE_ORDER; anything at or beyond it is post-close.
const CLOSING_STAGE = "Closing";
const CLOSING_STAGE_IDX = PIPELINE_STAGE_ORDER.indexOf(CLOSING_STAGE);

function isRealisationStage(stage: string): boolean {
  const idx = PIPELINE_STAGE_ORDER.indexOf(stage);
  // idx === -1 means unknown stage; treat as pre-close to be safe
  return idx !== -1 && idx >= CLOSING_STAGE_IDX;
}

// Convention: dis-synergy amounts are stored as positive magnitudes.
// The isDisynergy flag signals they are subtracted from the net total.
// parseFy accepts number | string | null so it works with both DB output (number)
// and form input (string). Math.abs guards against accidental sign entry.
function parseFy(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return isNaN(val) ? null : Math.abs(val);
  if (val.trim() === "") return null;
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? null : Math.abs(n);
}

function formatMillions(val: number | null): string {
  if (val === null) return "—";
  const abs = Math.abs(val);
  const prefix = val < 0 ? "−" : "";
  if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(1)}B`;
  return `${prefix}${abs.toFixed(1)}M`;
}

function fyMagnitude(s: Synergy): number {
  return [s.fy1, s.fy2, s.fy3, s.fy4, s.fy5]
    .map(parseFy)
    .reduce<number>((sum, v) => sum + (v ?? 0), 0);
}

// Sum of all FY values net of dis-synergies — used for the Simple NPV card
function simpleNpv(actuals: Synergy[], dissynergies: Synergy[]): number {
  const gross = actuals.reduce((sum, s) => sum + fyMagnitude(s), 0);
  const disyn = dissynergies.reduce((sum, s) => sum + fyMagnitude(s), 0);
  return gross - disyn;
}

function confidenceColor(c: string) {
  if (c === "Probable") return "text-emerald-500 border-emerald-500/30 bg-emerald-500/10";
  if (c === "Possible") return "text-amber-500 border-amber-500/30 bg-amber-500/10";
  return "text-muted-foreground border-border/50";
}

function statusColor(s: string) {
  if (s === "Realised") return "text-emerald-500 border-emerald-500/30 bg-emerald-500/10";
  if (s === "On Track") return "text-primary border-primary/30 bg-primary/10";
  if (s === "Slipping") return "text-destructive border-destructive/30 bg-destructive/10";
  return "text-muted-foreground border-border/50";
}

// Parse a text input to a number suitable for API submission (positive magnitude only)
function inputToNumber(val: string): number | null {
  if (!val.trim()) return null;
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? null : Math.abs(n);
}

type FormData = {
  type: SynergyType;
  description: string;
  fy1: string;
  fy2: string;
  fy3: string;
  fy4: string;
  fy5: string;
  oneTimeCost: string;
  confidence: Confidence;
  ownerName: string;
  realisationStartMonth: string;
  realisationStatus: Status;
  isDisynergy: boolean;
};

const emptyForm = (): FormData => ({
  type: "Revenue",
  description: "",
  fy1: "",
  fy2: "",
  fy3: "",
  fy4: "",
  fy5: "",  oneTimeCost: "",
  confidence: "Possible",
  ownerName: "",
  realisationStartMonth: "",
  realisationStatus: "Not Started",
  isDisynergy: false,
});

function SynergyFormFields({
  form,
  onChange,
  canEditStatus,
}: {
  form: FormData;
  onChange: (f: Partial<FormData>) => void;
  canEditStatus: boolean;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          <input
            type="checkbox"
            checked={form.isDisynergy}
            onChange={(e) => onChange({ isDisynergy: e.target.checked })}
            className="accent-destructive w-3.5 h-3.5"
          />
          Mark as Dis-synergy (negative value)
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Type <span className="text-destructive">*</span></label>
          <Select value={form.type} onValueChange={(v) => onChange({ type: v as SynergyType })}>
            <SelectTrigger className="rounded-sm bg-background/50 h-8"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-sm">
              {SYNERGY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Confidence <span className="text-destructive">*</span></label>
          <Select value={form.confidence} onValueChange={(v) => onChange({ confidence: v as Confidence })}>
            <SelectTrigger className="rounded-sm bg-background/50 h-8"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-sm">
              {CONFIDENCES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Description <span className="text-destructive">*</span></label>
        <Textarea
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="rounded-sm bg-background/50 resize-none h-16"
          placeholder="Describe the synergy hypothesis…"
        />
      </div>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Annual Value ($M) — FY1 to FY5 (positive magnitudes)</div>
        <div className="grid grid-cols-5 gap-2">
          {(["fy1", "fy2", "fy3", "fy4", "fy5"] as const).map((fy, i) => (
            <div key={fy} className="space-y-1">
              <label className="text-[9px] font-mono text-muted-foreground/60 uppercase">FY{i + 1}</label>
              <Input
                value={form[fy]}
                onChange={(e) => onChange({ [fy]: e.target.value })}
                className="rounded-sm bg-background/50 h-8 text-sm"
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">One-Time Cost ($M)</label>
          <Input
            value={form.oneTimeCost}
            onChange={(e) => onChange({ oneTimeCost: e.target.value })}
            className="rounded-sm bg-background/50 h-8"
            placeholder="e.g. 12.5"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Realisation Start</label>
          <Input
            value={form.realisationStartMonth}
            onChange={(e) => onChange({ realisationStartMonth: e.target.value })}
            className="rounded-sm bg-background/50 h-8"
            placeholder="e.g. 2026-Q1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Owner</label>
          <Input
            value={form.ownerName}
            onChange={(e) => onChange({ ownerName: e.target.value })}
            className="rounded-sm bg-background/50 h-8"
            placeholder="Name or team…"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            Realisation Status
            {!canEditStatus && <Lock size={9} className="text-muted-foreground/40" />}
          </label>
          <Select
            value={form.realisationStatus}
            onValueChange={(v) => onChange({ realisationStatus: v as Status })}
            disabled={!canEditStatus}
          >
            <SelectTrigger className="rounded-sm bg-background/50 h-8 disabled:opacity-50 disabled:cursor-not-allowed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-sm">
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {!canEditStatus && (
            <p className="text-[9px] font-mono text-muted-foreground/50">Available from Closing stage</p>
          )}
        </div>
      </div>
    </div>
  );
}

function FyCurve({ synergy }: { synergy: Synergy }) {
  const vals = [synergy.fy1, synergy.fy2, synergy.fy3, synergy.fy4, synergy.fy5].map(parseFy);
  const hasValues = vals.some((v) => v !== null);
  if (!hasValues) return null;
  const max = Math.max(...vals.map((v) => v ?? 0), 1);
  return (
    <div className="flex items-end gap-1.5 mt-2">
      {vals.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] font-mono text-muted-foreground/60">{v !== null ? formatMillions(v) : "—"}</span>
          <div
            className={`w-7 rounded-sm ${synergy.isDisynergy ? "bg-destructive/40" : "bg-primary/30"}`}
            style={{ height: v !== null ? `${Math.max(4, Math.round((v / max) * 36))}px` : "4px" }}
          />
          <span className="text-[9px] font-mono text-muted-foreground/40">FY{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

function SynergyCard({
  synergy,
  onEdit,
  onDelete,
  showStatus,
}: {
  synergy: Synergy;
  onEdit: () => void;
  onDelete: () => void;
  showStatus: boolean;
}) {
  const magnitude = fyMagnitude(synergy);
  const cost = parseFy(synergy.oneTimeCost);
  const displayTotal = synergy.isDisynergy ? -magnitude : magnitude;

  return (
    <Card className="bg-card/30 border-border rounded-sm group">
      <CardContent className="px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-sm border-border/60">
              {synergy.type}
            </Badge>
            {synergy.isDisynergy && (
              <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-sm text-destructive border-destructive/30 bg-destructive/10">
                <TrendingDown size={9} className="mr-1" /> Dis-synergy
              </Badge>
            )}
            <Badge variant="outline" className={`font-mono text-[10px] uppercase rounded-sm ${confidenceColor(synergy.confidence)}`}>
              {synergy.confidence}
            </Badge>
            {showStatus && synergy.realisationStatus && synergy.realisationStatus !== "Not Started" && (
              <Badge variant="outline" className={`font-mono text-[10px] uppercase rounded-sm ${statusColor(synergy.realisationStatus)}`}>
                {synergy.realisationStatus}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground md:opacity-0 md:group-hover:opacity-100 transition-opacity" onClick={onEdit}>
              <Pencil size={11} />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive/60 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 transition-opacity" onClick={onDelete}>
              <Trash2 size={11} />
            </Button>
          </div>
        </div>

        <p className="text-sm leading-relaxed">{synergy.description}</p>

        <div className="flex items-center gap-4 flex-wrap pt-1">
          <div className="text-[10px] font-mono">
            <span className="text-muted-foreground uppercase tracking-wider">5Y Total: </span>
            <span className={`font-bold ${displayTotal < 0 ? "text-destructive" : displayTotal > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
              {magnitude > 0 ? formatMillions(displayTotal) : "—"}
            </span>
          </div>
          {cost !== null && (
            <div className="text-[10px] font-mono">
              <span className="text-muted-foreground uppercase tracking-wider">One-Time Cost: </span>
              <span className="text-amber-500">{formatMillions(cost)}</span>
            </div>
          )}
          {synergy.ownerName && (
            <div className="text-[10px] font-mono text-muted-foreground">
              <span className="uppercase tracking-wider">Owner: </span>{synergy.ownerName}
            </div>
          )}
          {synergy.realisationStartMonth && (
            <div className="text-[10px] font-mono text-muted-foreground">
              <span className="uppercase tracking-wider">From: </span>{synergy.realisationStartMonth}            </div>
          )}
        </div>

        <FyCurve synergy={synergy} />
      </CardContent>
    </Card>
  );
}

export function SynergiesTab({ targetId, currentStage }: { targetId: number; currentStage: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());

  const canEditStatus = isRealisationStage(currentStage);

  const { data: synergies, isLoading } = useListSynergies(targetId, {
    query: { enabled: !!targetId, queryKey: getListSynergiesQueryKey(targetId) },
  });

  const createSynergy = useCreateSynergy();
  const updateSynergy = useUpdateSynergy();
  const deleteSynergy = useDeleteSynergy();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListSynergiesQueryKey(targetId) });
  const patchForm = (partial: Partial<FormData>) => setForm((f) => ({ ...f, ...partial }));

  const buildPayload = (f: FormData) => ({
    type: f.type,
    description: f.description,
    fy1: inputToNumber(f.fy1),
    fy2: inputToNumber(f.fy2),
    fy3: inputToNumber(f.fy3),
    fy4: inputToNumber(f.fy4),
    fy5: inputToNumber(f.fy5),
    oneTimeCost: inputToNumber(f.oneTimeCost),
    confidence: f.confidence,
    ownerName: f.ownerName || null,
    realisationStartMonth: f.realisationStartMonth || null,
    // Only send realisationStatus when the deal has reached the Closing stage
    realisationStatus: canEditStatus ? f.realisationStatus : undefined,
    isDisynergy: f.isDisynergy,
  });

  const handleAdd = () => {
    if (!form.description.trim()) return;
    createSynergy.mutate(
      { id: targetId, data: buildPayload(form) },
      {
        onSuccess: () => {
          toast({ title: "Synergy Added" });
          setAddOpen(false);
          setForm(emptyForm());
          invalidate();
        },
        onError: () => toast({ title: "Error", description: "Could not add synergy", variant: "destructive" }),
      }
    );
  };

  const openEdit = (s: Synergy) => {
    setEditId(s.id);
    setForm({
      type: s.type as SynergyType,
      description: s.description,
      fy1: s.fy1 !== null && s.fy1 !== undefined ? String(s.fy1) : "",
      fy2: s.fy2 !== null && s.fy2 !== undefined ? String(s.fy2) : "",
      fy3: s.fy3 !== null && s.fy3 !== undefined ? String(s.fy3) : "",
      fy4: s.fy4 !== null && s.fy4 !== undefined ? String(s.fy4) : "",
      fy5: s.fy5 !== null && s.fy5 !== undefined ? String(s.fy5) : "",
      oneTimeCost: s.oneTimeCost !== null && s.oneTimeCost !== undefined ? String(s.oneTimeCost) : "",
      confidence: s.confidence as Confidence,
      ownerName: s.ownerName ?? "",
      realisationStartMonth: s.realisationStartMonth ?? "",
      realisationStatus: (s.realisationStatus as Status) ?? "Not Started",
      isDisynergy: s.isDisynergy,
    });
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editId || !form.description.trim()) return;
    updateSynergy.mutate(
      { id: editId, data: buildPayload(form) },
      {
        onSuccess: () => {
          toast({ title: "Synergy Updated" });
          setEditOpen(false);
          setEditId(null);
          setForm(emptyForm());
          invalidate();
        },
        onError: () => toast({ title: "Error", description: "Could not update synergy", variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteSynergy.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Synergy Deleted" });
          setDeleteOpen(false);
          setDeleteId(null);
          invalidate();
        },
        onError: () => toast({ title: "Error", description: "Could not delete synergy", variant: "destructive" }),
      }
    );
  };

  const all = synergies ?? [];
  const actuals = all.filter((s) => !s.isDisynergy);
  const dissynergies = all.filter((s) => s.isDisynergy);

  // Gross synergy value (actuals only, all positive magnitudes)
  const grandTotal = actuals.reduce((sum, s) => sum + fyMagnitude(s), 0);
  // Dis-synergy total (positive magnitudes)
  const disynergyTotal = dissynergies.reduce((sum, s) => sum + fyMagnitude(s), 0);
  // NPV (simple undiscounted sum) = gross synergy − dis-synergies
  const npv = simpleNpv(actuals, dissynergies);
  const totalCost = all.reduce((sum, s) => sum + (parseFy(s.oneTimeCost) ?? 0), 0);

  const byType: Record<string, Synergy[]> = {};
  for (const t of SYNERGY_TYPES) {
    const items = actuals.filter((s) => s.type === t);
    if (items.length > 0) byType[t] = items;
  }

  const totalByType = (type: string) =>
    actuals.filter((s) => s.type === type).reduce((sum, s) => sum + fyMagnitude(s), 0);

  const confidenceCounts = {
    Probable: all.filter((s) => s.confidence === "Probable").length,
    Possible: all.filter((s) => s.confidence === "Possible").length,
    Aspirational: all.filter((s) => s.confidence === "Aspirational").length,
  };

  return (
    <div className="space-y-5 mt-0">      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="hidden md:flex rounded-sm font-mono text-[10px] uppercase border-border"
          onClick={() => { setForm(emptyForm()); setAddOpen(true); }}
        >
          <Plus size={13} className="mr-1" /> Add Hypothesis
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : all.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm py-16 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
          No synergy hypotheses yet
        </div>
      ) : (
        <>
          {/* Summary Card */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card/30 border border-border/60 rounded-sm px-4 py-3">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Total Synergy Value</div>
              <div className="text-xl font-bold font-mono text-emerald-500">{formatMillions(grandTotal)}</div>
              <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{actuals.length} {actuals.length === 1 ? "entry" : "entries"}</div>
            </div>
            <div className="bg-card/30 border border-border/60 rounded-sm px-4 py-3">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">NPV (Simple Sum)</div>
              <div className={`text-xl font-bold font-mono ${npv >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatMillions(npv)}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                {dissynergies.length > 0 ? `−${formatMillions(disynergyTotal)} dis-syn` : "Net of dis-synergies"}
              </div>
            </div>
            <div className="bg-card/30 border border-border/60 rounded-sm px-4 py-3">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">One-Time Cost</div>
              <div className="text-xl font-bold font-mono text-amber-500">{formatMillions(totalCost)}</div>
              <div className="text-[10px] font-mono text-muted-foreground mt-0.5">Implementation cost</div>
            </div>
            <div className="bg-card/30 border border-border/60 rounded-sm px-4 py-3">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">By Confidence</div>
              <div className="flex items-center gap-2 mt-1.5">
                {confidenceCounts.Probable > 0 && (
                  <span className="text-[10px] font-mono text-emerald-500 font-bold">{confidenceCounts.Probable}P</span>
                )}
                {confidenceCounts.Possible > 0 && (
                  <span className="text-[10px] font-mono text-amber-500 font-bold">{confidenceCounts.Possible}Po</span>
                )}
                {confidenceCounts.Aspirational > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground font-bold">{confidenceCounts.Aspirational}A</span>
                )}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1">{all.length} total hypotheses</div>
            </div>
          </div>

          {/* Realisation status note when not yet in closing stage */}
          {!canEditStatus && (
            <div className="flex items-start gap-2 p-3 border border-border/40 rounded-sm bg-muted/10 text-[10px] font-mono text-muted-foreground">
              <AlertTriangle size={11} className="shrink-0 mt-0.5 text-amber-500/60" />
              Realisation status tracking becomes available once the deal reaches the Closing stage.
            </div>
          )}

          {/* Synergies by type */}
          {SYNERGY_TYPES.map((type) => {
            const items = byType[type];
            if (!items) return null;
            const typeTotal = totalByType(type);
            return (
              <div key={type}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={12} className="text-primary/60" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{type} Synergies</span>
                    <span className="text-[10px] font-mono text-muted-foreground/60">({items.length})</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-500">{formatMillions(typeTotal)}</span>
                </div>
                <div className="space-y-2">
                  {items.map((s) => (
                    <SynergyCard
                      key={s.id}
                      synergy={s}
                      onEdit={() => openEdit(s)}
                      onDelete={() => { setDeleteId(s.id); setDeleteOpen(true); }}
                      showStatus={canEditStatus}
                    />
                  ))}

                </div>
              </div>
            );
          })}

          {/* Dis-synergies */}
          {dissynergies.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingDown size={12} className="text-destructive/60" />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Dis-synergies</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">({dissynergies.length})</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-destructive">−{formatMillions(disynergyTotal)}</span>
              </div>
              <div className="space-y-2">
                {dissynergies.map((s) => (
                  <SynergyCard
                    key={s.id}
                    synergy={s}
                    onEdit={() => openEdit(s)}
                    onDelete={() => { setDeleteId(s.id); setDeleteOpen(true); }}
                    showStatus={canEditStatus}
                  />
                ))}

              </div>
            </div>
          )}
        </>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) setForm(emptyForm()); setAddOpen(open); }}>
        <DialogContent className="sm:max-w-[580px] border-border bg-sidebar rounded-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Add Synergy Hypothesis</DialogTitle>
          </DialogHeader>
          <SynergyFormFields form={form} onChange={patchForm} canEditStatus={canEditStatus} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setForm(emptyForm()); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button onClick={handleAdd} disabled={!form.description.trim() || createSynergy.isPending} className="rounded-sm font-mono uppercase text-[10px]">Add Hypothesis</Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) { setForm(emptyForm()); setEditId(null); } setEditOpen(open); }}>
        <DialogContent className="sm:max-w-[580px] border-border bg-sidebar rounded-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Edit Synergy Hypothesis</DialogTitle>
          </DialogHeader>
          <SynergyFormFields form={form} onChange={patchForm} canEditStatus={canEditStatus} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOpen(false); setForm(emptyForm()); setEditId(null); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button onClick={handleEdit} disabled={!form.description.trim() || updateSynergy.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save Changes</Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-[400px] border-destructive bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg text-destructive">Delete Synergy</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">This will permanently remove this synergy hypothesis. This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteId(null); }} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteSynergy.isPending} className="rounded-sm font-mono uppercase text-[10px]">Delete</Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Add Button */}
      <div className="md:hidden fixed bottom-20 right-4 z-50">
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
          onClick={() => { setForm(emptyForm()); setAddOpen(true); }}
        >
          <Plus size={20} />
        </Button>
      </div>    </div>
  );
}
