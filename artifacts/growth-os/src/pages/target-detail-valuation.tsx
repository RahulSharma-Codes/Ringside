import React, { useState, useEffect } from "react";
import {
  useListValuations, getListValuationsQueryKey,
  useCreateValuation,
  useDeleteValuation,
  useGetDealEconomics, getGetDealEconomicsQueryKey,
  useUpsertDealEconomics,
  useGetValuationSanity, getGetValuationSanityQueryKey, useRunValuationSanity,
  useGetAiRunHistory, getGetAiRunHistoryQueryKey,
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
  Plus, Trash2, TrendingUp, BarChart3, Landmark, Save, Loader2,
  Brain, Sparkles, AlertTriangle, History, ChevronDown, ChevronRight,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const METHODOLOGIES = ["DCF", "Trading Comps", "Transaction Comps", "LBO", "Asset", "Other"] as const;
type Methodology = typeof METHODOLOGIES[number];

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "AUD", "CAD", "JPY"] as const;

const METHODOLOGY_COLORS: Record<string, string> = {
  DCF: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Trading Comps": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Transaction Comps": "bg-violet-500/10 text-violet-400 border-violet-500/20",
  LBO: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Asset: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Other: "bg-muted text-muted-foreground border-border",
};

const MULTIPLES_FLAG_COLORS: Record<string, string> = {
  "in-range":           "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "above-range":        "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "below-range":        "bg-red-500/10 text-red-400 border-red-500/20",
  "insufficient-data":  "bg-muted text-muted-foreground border-border",
};

type ValuationEntry = {
  id: number;
  targetId: number;
  version: number;
  stageAtRecord?: string | null;
  methodology: string;
  valueLow?: string | null;
  valuePoint?: string | null;
  valueHigh?: string | null;
  currency: string;
  notes?: string | null;
  recordedBy?: string | null;
  recordedAt?: string | null;
};

type DealEconomics = {
  id: number;
  targetId: number;
  cashPct?: string | null;
  equityPct?: string | null;
  earnoutPct?: string | null;
  deferredPct?: string | null;
  escrowPct?: string | null;
  totalEv?: string | null;
  totalEquityValue?: string | null;
  irrBase?: string | null;
  irrUpside?: string | null;
  irrDownside?: string | null;
  moicBase?: string | null;
  moicUpside?: string | null;
  moicDownside?: string | null;
  paybackYears?: string | null;
  updatedAt?: string | null;
};

function fmtRange(v: ValuationEntry) {
  if (v.valuePoint) {
    const low = v.valueLow ? `${v.valueLow} – ` : "";
    const high = v.valueHigh ? ` – ${v.valueHigh}` : "";
    return `${low}${v.valuePoint}${high} ${v.currency}`;
  }
  if (v.valueLow || v.valueHigh) {
    return `${v.valueLow ?? "?"} – ${v.valueHigh ?? "?"} ${v.currency}`;
  }
  return null;
}

function EconField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "—"}
          className="rounded-sm bg-background/50 text-sm pr-8"
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/60 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function ValuationTab({ targetId, currentStage }: { targetId: number; currentStage?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: valuations, isLoading: loadingValuations } = useListValuations(targetId, {
    query: { enabled: !!targetId, queryKey: getListValuationsQueryKey(targetId) },
  });
  const { data: economics, isLoading: loadingEcon } = useGetDealEconomics(targetId, {
    query: { enabled: !!targetId, queryKey: getGetDealEconomicsQueryKey(targetId) },
  });

  const createValuation = useCreateValuation();
  const deleteValuation = useDeleteValuation();
  const upsertEconomics = useUpsertDealEconomics();

  const { data: sanityData, isLoading: loadingSanity } = useGetValuationSanity(targetId, {
    query: { enabled: !!targetId, queryKey: getGetValuationSanityQueryKey(targetId) },
  });
  const runSanity = useRunValuationSanity();

  const [sanityHistoryOpen, setSanityHistoryOpen] = useState(false);
  const [sanityExpandedId, setSanityExpandedId] = useState<number | null>(null);
  const { data: sanityHistory } = useGetAiRunHistory(targetId, { phase: "valuation-sanity", limit: 20 }, {
    query: { enabled: !!targetId && sanityHistoryOpen, queryKey: getGetAiRunHistoryQueryKey(targetId, { phase: "valuation-sanity", limit: 20 }) },
  });

  const invalidateValuations = () => queryClient.invalidateQueries({ queryKey: getListValuationsQueryKey(targetId) });
  const invalidateEconomics = () => queryClient.invalidateQueries({ queryKey: getGetDealEconomicsQueryKey(targetId) });
  const invalidateSanity = () => queryClient.invalidateQueries({ queryKey: getGetValuationSanityQueryKey(targetId) });

  const handleRunSanity = () => {
    runSanity.mutate(
      { targetId },
      {
        onSuccess: () => { invalidateSanity(); },
        onError: () => toast({ title: "AI Error", description: "Could not run sanity check", variant: "destructive" }),
      },
    );
  };

  const [addOpen, setAddOpen] = useState(false);
  const [addMethodology, setAddMethodology] = useState<string>("DCF");
  const [addValueLow, setAddValueLow] = useState("");
  const [addValuePoint, setAddValuePoint] = useState("");
  const [addValueHigh, setAddValueHigh] = useState("");
  const [addCurrency, setAddCurrency] = useState("USD");
  const [addStageAtRecord, setAddStageAtRecord] = useState(currentStage ?? "");
  const [addNotes, setAddNotes] = useState("");
  const [addRecordedBy, setAddRecordedBy] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [econDirty, setEconDirty] = useState(false);
  const [econSaving, setEconSaving] = useState(false);
  const [econ, setEcon] = useState<Omit<DealEconomics, "id" | "targetId" | "updatedAt">>({
    cashPct: "",
    equityPct: "",
    earnoutPct: "",
    deferredPct: "",
    escrowPct: "",
    totalEv: "",
    totalEquityValue: "",
    irrBase: "",
    irrUpside: "",
    irrDownside: "",
    moicBase: "",
    moicUpside: "",
    moicDownside: "",
    paybackYears: "",
  });

  useEffect(() => {
    if (economics && economics.id !== 0) {
      setEcon({
        cashPct: economics.cashPct ?? "",
        equityPct: economics.equityPct ?? "",
        earnoutPct: economics.earnoutPct ?? "",
        deferredPct: economics.deferredPct ?? "",
        escrowPct: economics.escrowPct ?? "",
        totalEv: economics.totalEv ?? "",
        totalEquityValue: economics.totalEquityValue ?? "",
        irrBase: economics.irrBase ?? "",
        irrUpside: economics.irrUpside ?? "",
        irrDownside: economics.irrDownside ?? "",
        moicBase: economics.moicBase ?? "",
        moicUpside: economics.moicUpside ?? "",
        moicDownside: economics.moicDownside ?? "",
        paybackYears: economics.paybackYears ?? "",
      });
      setEconDirty(false);
    }
  }, [economics]);

  const updateEcon = (key: keyof typeof econ) => (val: string) => {
    setEcon((prev) => ({ ...prev, [key]: val }));
    setEconDirty(true);
  };

  const handleSaveEcon = async () => {
    setEconSaving(true);
    upsertEconomics.mutate(
      {
        id: targetId,
        data: {
          cashPct: econ.cashPct || null,
          equityPct: econ.equityPct || null,
          earnoutPct: econ.earnoutPct || null,
          deferredPct: econ.deferredPct || null,
          escrowPct: econ.escrowPct || null,
          totalEv: econ.totalEv || null,
          totalEquityValue: econ.totalEquityValue || null,
          irrBase: econ.irrBase || null,
          irrUpside: econ.irrUpside || null,
          irrDownside: econ.irrDownside || null,
          moicBase: econ.moicBase || null,
          moicUpside: econ.moicUpside || null,
          moicDownside: econ.moicDownside || null,
          paybackYears: econ.paybackYears || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Economics Saved" });
          setEconDirty(false);
          invalidateEconomics();
        },
        onError: () => toast({ title: "Error", description: "Could not save economics", variant: "destructive" }),
        onSettled: () => setEconSaving(false),
      },
    );
  };

  const resetAddForm = () => {
    setAddMethodology("DCF");
    setAddValueLow(""); setAddValuePoint(""); setAddValueHigh("");
    setAddCurrency("USD"); setAddStageAtRecord(currentStage ?? "");
    setAddNotes(""); setAddRecordedBy("");
  };

  const handleAdd = () => {
    if (!addMethodology) return;
    createValuation.mutate(
      {
        id: targetId,
        data: {
          methodology: addMethodology,
          valueLow: addValueLow || null,
          valuePoint: addValuePoint || null,
          valueHigh: addValueHigh || null,
          currency: addCurrency,
          stageAtRecord: addStageAtRecord || null,
          notes: addNotes || null,
          recordedBy: addRecordedBy || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Valuation Recorded" });
          setAddOpen(false); resetAddForm(); invalidateValuations();
        },
        onError: () => toast({ title: "Error", description: "Could not add valuation", variant: "destructive" }),
      },
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteValuation.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Entry Deleted" });
          setDeleteOpen(false); setDeleteId(null); invalidateValuations();
        },
        onError: () => toast({ title: "Error", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Methodology Log ───────────────────────────────────────────────── */}
      <Card className="bg-card/30 border-border rounded-sm">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-primary" />
              <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Methodology Log</CardTitle>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-sm font-mono text-[10px] uppercase border-border gap-1"
              onClick={() => setAddOpen(true)}
            >
              <Plus size={12} /> Add Entry
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {loadingValuations ? (
            <Skeleton className="h-24 w-full" />
          ) : !valuations?.length ? (
            <div className="border border-dashed border-border rounded-sm py-10 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
              No valuation entries yet
            </div>
          ) : (
            <div className="space-y-2">
              {(valuations as ValuationEntry[]).map((v) => {
                const range = fmtRange(v);
                const cls = METHODOLOGY_COLORS[v.methodology] ?? METHODOLOGY_COLORS.Other;
                return (
                  <div
                    key={v.id}
                    className="flex items-start gap-3 p-3 rounded-sm border border-border bg-background/30 group hover:bg-card/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-sm ${cls}`}>
                          {v.methodology}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground/60">v{v.version}</span>
                        {v.stageAtRecord && (
                          <span className="text-[10px] font-mono text-muted-foreground/50">@ {v.stageAtRecord}</span>
                        )}
                        {v.recordedAt && (
                          <span className="text-[10px] font-mono text-muted-foreground/50">
                            {format(parseISO(v.recordedAt), "MMM d, yyyy")}
                          </span>
                        )}
                        {v.recordedBy && (
                          <span className="text-[10px] font-mono text-muted-foreground/50">by {v.recordedBy}</span>
                        )}
                      </div>
                      {range && (
                        <div className="text-base font-mono font-semibold text-foreground tabular-nums">
                          {range}
                        </div>
                      )}
                      {v.notes && (
                        <div className="text-[11px] text-muted-foreground mt-1 italic leading-relaxed">
                          {v.notes}
                        </div>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive/50 hover:text-destructive shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity mt-0.5"
                      onClick={() => { setDeleteId(v.id); setDeleteOpen(true); }}
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Consideration Structure ──────────────────────────────────────── */}
      <Card className="bg-card/30 border-border rounded-sm">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark size={15} className="text-primary" />
              <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Consideration Structure</CardTitle>
            </div>
            {econDirty && (
              <Button
                size="sm"
                className="rounded-sm font-mono text-[10px] uppercase gap-1 h-7"
                onClick={handleSaveEcon}
                disabled={econSaving}
              >
                {econSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                Save
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {loadingEcon ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <EconField label="Total EV" value={econ.totalEv ?? ""} onChange={updateEcon("totalEv")} placeholder="e.g. 150m" />
                <EconField label="Total Equity Value" value={econ.totalEquityValue ?? ""} onChange={updateEcon("totalEquityValue")} placeholder="e.g. 120m" />
              </div>
              <div className="border-t border-border/50 pt-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Consideration Mix</div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <EconField label="Cash" value={econ.cashPct ?? ""} onChange={updateEcon("cashPct")} placeholder="0" suffix="%" />
                  <EconField label="Equity" value={econ.equityPct ?? ""} onChange={updateEcon("equityPct")} placeholder="0" suffix="%" />
                  <EconField label="Earn-out" value={econ.earnoutPct ?? ""} onChange={updateEcon("earnoutPct")} placeholder="0" suffix="%" />
                  <EconField label="Deferred" value={econ.deferredPct ?? ""} onChange={updateEcon("deferredPct")} placeholder="0" suffix="%" />
                  <EconField label="Escrow" value={econ.escrowPct ?? ""} onChange={updateEcon("escrowPct")} placeholder="0" suffix="%" />
                </div>
              </div>
              {economics?.updatedAt && !econDirty && (
                <div className="text-[10px] font-mono text-muted-foreground/50 text-right">
                  Last saved {format(parseISO(economics.updatedAt), "MMM d, yyyy · HH:mm")}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Returns View ─────────────────────────────────────────────────── */}
      <Card className="bg-card/30 border-border rounded-sm">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-primary" />
              <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Returns</CardTitle>
            </div>
            {econDirty && (
              <Button
                size="sm"
                className="rounded-sm font-mono text-[10px] uppercase gap-1 h-7"
                onClick={handleSaveEcon}
                disabled={econSaving}
              >
                {econSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                Save
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {loadingEcon ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">IRR</div>
                <div className="grid grid-cols-3 gap-3">
                  <EconField label="Base" value={econ.irrBase ?? ""} onChange={updateEcon("irrBase")} placeholder="e.g. 25%" />
                  <EconField label="Upside" value={econ.irrUpside ?? ""} onChange={updateEcon("irrUpside")} placeholder="e.g. 35%" />
                  <EconField label="Downside" value={econ.irrDownside ?? ""} onChange={updateEcon("irrDownside")} placeholder="e.g. 15%" />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">MOIC</div>
                <div className="grid grid-cols-3 gap-3">
                  <EconField label="Base" value={econ.moicBase ?? ""} onChange={updateEcon("moicBase")} placeholder="e.g. 2.5x" />
                  <EconField label="Upside" value={econ.moicUpside ?? ""} onChange={updateEcon("moicUpside")} placeholder="e.g. 3.5x" />
                  <EconField label="Downside" value={econ.moicDownside ?? ""} onChange={updateEcon("moicDownside")} placeholder="e.g. 1.8x" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <EconField label="Payback (years)" value={econ.paybackYears ?? ""} onChange={updateEcon("paybackYears")} placeholder="e.g. 4" suffix="yr" />
              </div>
              {economics?.updatedAt && !econDirty && (
                <div className="text-[10px] font-mono text-muted-foreground/50 text-right">
                  Last saved {format(parseISO(economics.updatedAt), "MMM d, yyyy · HH:mm")}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Valuation Sanity-Check */}
      {(valuations?.length ?? 0) > 0 && (
        <Card className="bg-card/30 border-border rounded-sm">
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain size={15} className="text-primary" />
                <CardTitle className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  AI Valuation Sanity-Check
                </CardTitle>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-sm font-mono text-[10px] uppercase border-border gap-1"
                disabled={runSanity.isPending}
                onClick={handleRunSanity}
              >
                {runSanity.isPending
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Sparkles size={11} />}
                {sanityData?.result ? "Re-run" : "Run Analysis"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loadingSanity ? (
              <div className="space-y-2">
                <div className="h-4 bg-muted/40 rounded animate-pulse w-3/4" />
                <div className="h-4 bg-muted/40 rounded animate-pulse w-1/2" />
              </div>
            ) : !sanityData?.result ? (
              <div className="border border-dashed border-border rounded-sm py-8 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
                No analysis yet — click Run Analysis above
              </div>
            ) : (
              <div className="space-y-4">
                {/* Multiples flag + timestamp */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-sm ${MULTIPLES_FLAG_COLORS[sanityData.result.multiplesFlag] ?? MULTIPLES_FLAG_COLORS["insufficient-data"]}`}>
                    Multiples: {sanityData.result.multiplesFlag.replace(/-/g, " ")}
                  </Badge>
                  {sanityData.result.runAt && (
                    <span className="text-[10px] font-mono text-muted-foreground/50">
                      {format(parseISO(sanityData.result.runAt), "MMM d · HH:mm")}
                    </span>
                  )}
                </div>

                {/* Methodology note */}
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Methodology Assessment</div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{sanityData.result.methodologyNote}</p>
                </div>

                {/* Sensitivity note */}
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sensitivity Coverage</div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{sanityData.result.sensitivityNote}</p>
                </div>

                {/* Red flags */}
                {sanityData.result.redFlags.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-red-400">
                      <AlertTriangle size={10} />
                      Red Flags ({sanityData.result.redFlags.length})
                    </div>
                    <ul className="space-y-1">
                      {sanityData.result.redFlags.map((flag, i) => (
                        <li key={i} className="text-xs text-red-400/80 flex items-start gap-2">
                          <span className="mt-0.5 shrink-0">•</span>
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {sanityData.result.redFlags.length === 0 && (
                  <p className="text-xs text-emerald-400/70 font-mono">No red flags identified.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Valuation Sanity History */}
      {(valuations?.length ?? 0) > 0 && (
        <div className="rounded-sm border border-border bg-card/20 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-card/40 transition-colors"
            onClick={() => { setSanityHistoryOpen((v) => !v); setSanityExpandedId(null); }}
          >
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <History size={12} />
              Sanity-Check History
            </div>
            {sanityHistoryOpen ? <ChevronDown size={13} className="text-muted-foreground" /> : <ChevronRight size={13} className="text-muted-foreground" />}
          </button>
          {sanityHistoryOpen && (
            <div className="border-t border-border divide-y divide-border/50">
              {!sanityHistory || sanityHistory.runs.length === 0 ? (
                <div className="px-4 py-6 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  No previous runs recorded
                </div>
              ) : (
                sanityHistory.runs.map((run, idx) => {
                  const out = run.outputJson as { multiplesFlag?: string; redFlags?: string[]; methodologyNote?: string; sensitivityNote?: string; runAt?: string };
                  const isExpanded = sanityExpandedId === run.id;
                  const isLatest = idx === 0;
                  return (
                    <div key={run.id} className="bg-background/10">
                      <button
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-card/30 transition-colors text-left"
                        onClick={() => setSanityExpandedId(isExpanded ? null : run.id)}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          {isLatest && (
                            <span className="text-[9px] font-mono uppercase text-primary/70 border border-primary/30 px-1 rounded-sm">Latest</span>
                          )}
                          {out.multiplesFlag && (
                            <Badge variant="outline" className={`font-mono text-[9px] uppercase rounded-sm ${MULTIPLES_FLAG_COLORS[out.multiplesFlag] ?? MULTIPLES_FLAG_COLORS["insufficient-data"]}`}>
                              {out.multiplesFlag.replace(/-/g, " ")}
                            </Badge>
                          )}
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {format(parseISO(run.createdAt), "MMM d, yyyy · HH:mm")}
                          </span>
                          {run.model && (
                            <span className="text-[9px] font-mono text-muted-foreground/50">{run.model}</span>
                          )}
                          {(out.redFlags?.length ?? 0) > 0 && (
                            <span className="text-[9px] font-mono text-red-400/70">{out.redFlags!.length} flag{out.redFlags!.length !== 1 ? "s" : ""}</span>
                          )}
                        </div>
                        {isExpanded ? <ChevronDown size={12} className="text-muted-foreground shrink-0" /> : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 bg-background/20">
                          {out.methodologyNote && (
                            <div className="space-y-0.5">
                              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Methodology</div>
                              <p className="text-xs text-foreground/80 leading-relaxed">{out.methodologyNote}</p>
                            </div>
                          )}
                          {out.sensitivityNote && (
                            <div className="space-y-0.5">
                              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Sensitivity</div>
                              <p className="text-xs text-foreground/80 leading-relaxed">{out.sensitivityNote}</p>
                            </div>
                          )}
                          {out.redFlags && out.redFlags.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[9px] font-mono uppercase tracking-wider text-red-400 flex items-center gap-1">
                                <AlertTriangle size={9} /> Red Flags
                              </div>
                              <ul className="space-y-0.5">
                                {out.redFlags.map((flag, i) => (
                                  <li key={i} className="text-xs text-red-400/80 flex items-start gap-1.5">
                                    <span className="shrink-0 mt-0.5">•</span><span>{flag}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {out.redFlags && out.redFlags.length === 0 && (
                            <p className="text-xs text-emerald-400/70 font-mono">No red flags identified.</p>
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
      )}

      {/* Add Valuation Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) resetAddForm(); setAddOpen(o); }}>
        <DialogContent className="sm:max-w-[500px] border-border bg-sidebar rounded-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Record Valuation</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Methodology <span className="text-destructive">*</span></label>
                <Select value={addMethodology} onValueChange={setAddMethodology}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">
                    {METHODOLOGIES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Currency</label>
                <Select value={addCurrency} onValueChange={setAddCurrency}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-2">Valuation Range</label>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground/60">Low</label>
                  <Input value={addValueLow} onChange={(e) => setAddValueLow(e.target.value)} className="rounded-sm bg-background/50" placeholder="e.g. 120m" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground/60">Point</label>
                  <Input value={addValuePoint} onChange={(e) => setAddValuePoint(e.target.value)} className="rounded-sm bg-background/50" placeholder="e.g. 150m" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground/60">High</label>
                  <Input value={addValueHigh} onChange={(e) => setAddValueHigh(e.target.value)} className="rounded-sm bg-background/50" placeholder="e.g. 180m" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Stage at Record</label>
                <Input value={addStageAtRecord} onChange={(e) => setAddStageAtRecord(e.target.value)} className="rounded-sm bg-background/50" placeholder={currentStage ?? "e.g. NDA / CIM"} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Recorded By</label>
                <Input value={addRecordedBy} onChange={(e) => setAddRecordedBy(e.target.value)} className="rounded-sm bg-background/50" placeholder="Name" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Notes</label>
              <Textarea
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                className="rounded-sm bg-background/50 min-h-[80px]"
                placeholder="Key assumptions, adjustments, or context..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => { resetAddForm(); setAddOpen(false); }}>Cancel</Button>
            <Button
              className="rounded-sm"
              onClick={handleAdd}
              disabled={!addMethodology || createValuation.isPending}
            >
              {createValuation.isPending ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
              Record Valuation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[400px] border-border bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight">Delete Entry?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This valuation entry will be permanently deleted.</p>
          <DialogFooter>
            <Button variant="outline" className="rounded-sm" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              className="rounded-sm"
              onClick={handleDelete}
              disabled={deleteValuation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
