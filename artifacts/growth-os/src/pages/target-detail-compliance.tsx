import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNdaRecords,
  getListNdaRecordsQueryKey,
  useCreateNdaRecord,
  useUpdateNdaRecord,
  useDeleteNdaRecord,
  useListRegulatoryClearances,
  getListRegulatoryClearancesQueryKey,
  useCreateRegulatoryClearance,
  useUpdateRegulatoryClearance,
  useDeleteRegulatoryClearance,
} from "@workspace/api-client-react";
import type {
  NdaRecord,
  RegulatoryClearance,
  CreateNdaRecordBody,
  UpdateNdaRecordBody,
  CreateRegulatoryClearanceBody,
  UpdateRegulatoryClearanceBody,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown, ChevronRight, Plus, Pencil, Trash2,
  ShieldCheck, AlertTriangle, Shield, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Constants ──────────────────────────────────────────────────────────────────

const NDA_SCOPES = ["One-way", "Mutual"] as const;
const NDA_STATUSES = ["Active", "Expired", "Extended"] as const;
const CLEARANCE_CATEGORIES = [
  "Antitrust-CCI", "RBI", "SEBI", "IRDAI", "FEMA-FDI", "DPDP",
  "Sanctions-PEP", "ABAC", "Other",
] as const;
const CLEARANCE_STATUSES = ["Not Required", "Pending", "Filed", "Cleared", "Blocked"] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function isExpiringWithin30Days(expiryDate: string | null | undefined): boolean {
  if (!expiryDate) return false;
  const d = new Date(expiryDate);
  const now = new Date();
  const days = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 30;
}

function isExpired(expiryDate: string | null | undefined): boolean {
  if (!expiryDate) return false;
  return new Date(expiryDate) < new Date();
}

function isOverdueClearing(item: RegulatoryClearance): boolean {
  if (!item.targetClearanceDate) return false;
  if (item.status === "Cleared" || item.status === "Not Required") return false;
  return new Date(item.targetClearanceDate) < new Date();
}

function daysFromNow(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ndaUrgencyScore(nda: NdaRecord): number {
  if (isExpired(nda.expiryDate) || nda.status === "Expired") return 0;
  if (isExpiringWithin30Days(nda.expiryDate)) return 1;
  return 2;
}

function clearanceUrgencyScore(clr: RegulatoryClearance): number {
  if (clr.status === "Blocked") return 0;
  if (isOverdueClearing(clr)) return 1;
  if (clr.status === "Pending" || clr.status === "Filed") return 2;
  return 3;
}

function ndaStatusColor(nda: NdaRecord): string {
  if (isExpired(nda.expiryDate) || nda.status === "Expired") return "destructive";
  if (isExpiringWithin30Days(nda.expiryDate)) return "secondary";
  return "outline";
}

function clearanceStatusColor(status: string): string {
  switch (status) {
    case "Cleared":      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
    case "Not Required": return "bg-muted text-muted-foreground border-border";
    case "Filed":        return "bg-blue-500/10 text-blue-700 border-blue-500/30";
    case "Pending":      return "bg-amber-500/10 text-amber-700 border-amber-500/30";
    case "Blocked":      return "bg-destructive/10 text-destructive border-destructive/30";
    default:             return "bg-muted text-muted-foreground border-border";
  }
}

// ── Blank forms ────────────────────────────────────────────────────────────────

const BLANK_NDA: CreateNdaRecordBody = {
  counterparty: "",
  effectiveDate: "",
  expiryDate: "",
  scope: "Mutual",
  termMonths: undefined,
  docReference: "",
  status: "Active",
  notes: "",
};

const BLANK_CLEARANCE: CreateRegulatoryClearanceBody = {
  category: "Antitrust-CCI",
  description: "",
  ownerName: "",
  status: "Pending",
  targetClearanceDate: "",
  evidenceReference: "",
  notes: "",
};

// ── NDA Dialog ─────────────────────────────────────────────────────────────────

interface NdaDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: NdaRecord | null;
  onSave: (data: CreateNdaRecordBody | UpdateNdaRecordBody) => Promise<void>;
  saving: boolean;
}

function NdaDialog({ open, onClose, initial, onSave, saving }: NdaDialogProps) {
  const [form, setForm] = useState<CreateNdaRecordBody>(
    initial
      ? {
          counterparty: initial.counterparty ?? "",
          effectiveDate: initial.effectiveDate ?? "",
          expiryDate: initial.expiryDate ?? "",
          scope: (initial.scope as "One-way" | "Mutual") ?? "Mutual",
          termMonths: initial.termMonths ?? undefined,
          docReference: initial.docReference ?? "",
          status: (initial.status as "Active" | "Expired" | "Extended") ?? "Active",
          notes: initial.notes ?? "",
        }
      : { ...BLANK_NDA }
  );

  React.useEffect(() => {
    setForm(
      initial
        ? {
            counterparty: initial.counterparty ?? "",
            effectiveDate: initial.effectiveDate ?? "",
            expiryDate: initial.expiryDate ?? "",
            scope: (initial.scope as "One-way" | "Mutual") ?? "Mutual",
            termMonths: initial.termMonths ?? undefined,
            docReference: initial.docReference ?? "",
            status: (initial.status as "Active" | "Expired" | "Extended") ?? "Active",
            notes: initial.notes ?? "",
          }
        : { ...BLANK_NDA }
    );
  }, [initial, open]);

  function set(k: keyof CreateNdaRecordBody, v: unknown) {
    setForm(f => ({ ...f, [k]: v }));
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit NDA Record" : "Add NDA Record"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Counterparty</Label>
              <Input value={form.counterparty ?? ""} onChange={e => set("counterparty", e.target.value)} placeholder="Entity name" />
            </div>
            <div className="space-y-1.5">
              <Label>Effective Date</Label>
              <Input type="date" value={form.effectiveDate ?? ""} onChange={e => set("effectiveDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiryDate ?? ""} onChange={e => set("expiryDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={form.scope ?? "Mutual"} onValueChange={v => set("scope", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NDA_SCOPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Confidentiality Term (months)</Label>
              <Input
                type="number"
                value={form.termMonths ?? ""}
                onChange={e => set("termMonths", e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="e.g. 24"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status ?? "Active"} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NDA_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Document Reference / Link</Label>
              <Input value={form.docReference ?? ""} onChange={e => set("docReference", e.target.value)} placeholder="URL or filename" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} rows={2} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : (initial ? "Save Changes" : "Add NDA")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Clearance Dialog ───────────────────────────────────────────────────────────

interface ClearanceDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: RegulatoryClearance | null;
  onSave: (data: CreateRegulatoryClearanceBody | UpdateRegulatoryClearanceBody) => Promise<void>;
  saving: boolean;
}

function ClearanceDialog({ open, onClose, initial, onSave, saving }: ClearanceDialogProps) {
  const [form, setForm] = useState<CreateRegulatoryClearanceBody>(
    initial
      ? {
          category: initial.category as CreateRegulatoryClearanceBody["category"],
          description: initial.description ?? "",
          ownerName: initial.ownerName ?? "",
          status: initial.status as CreateRegulatoryClearanceBody["status"],
          targetClearanceDate: initial.targetClearanceDate ?? "",
          evidenceReference: initial.evidenceReference ?? "",
          notes: initial.notes ?? "",
        }
      : { ...BLANK_CLEARANCE }
  );

  React.useEffect(() => {
    setForm(
      initial
        ? {
            category: initial.category as CreateRegulatoryClearanceBody["category"],
            description: initial.description ?? "",
            ownerName: initial.ownerName ?? "",
            status: initial.status as CreateRegulatoryClearanceBody["status"],
            targetClearanceDate: initial.targetClearanceDate ?? "",
            evidenceReference: initial.evidenceReference ?? "",
            notes: initial.notes ?? "",
          }
        : { ...BLANK_CLEARANCE }
    );
  }, [initial, open]);

  function set(k: keyof CreateRegulatoryClearanceBody, v: unknown) {
    setForm(f => ({ ...f, [k]: v }));
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Clearance Item" : "Add Clearance Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLEARANCE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status ?? "Pending"} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLEARANCE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description ?? ""} onChange={e => set("description", e.target.value)} placeholder="Brief description of clearance requirement" />
            </div>
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Input value={form.ownerName ?? ""} onChange={e => set("ownerName", e.target.value)} placeholder="Name" />
            </div>
            <div className="space-y-1.5">
              <Label>Target Clearance Date</Label>
              <Input type="date" value={form.targetClearanceDate ?? ""} onChange={e => set("targetClearanceDate", e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Evidence Reference / Link</Label>
              <Input value={form.evidenceReference ?? ""} onChange={e => set("evidenceReference", e.target.value)} placeholder="URL or document name" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} rows={2} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving}>
            {saving ? "Saving…" : (initial ? "Save Changes" : "Add Item")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main ComplianceTab ─────────────────────────────────────────────────────────

interface ComplianceTabProps {
  targetId: number;
}

export function ComplianceTab({ targetId }: ComplianceTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: ndas = [], isLoading: ndaLoading } = useListNdaRecords(targetId);
  const { data: clearances = [], isLoading: clrLoading } = useListRegulatoryClearances(targetId);

  const invalidateNda = () => qc.invalidateQueries({ queryKey: getListNdaRecordsQueryKey(targetId) });
  const invalidateClr = () => qc.invalidateQueries({ queryKey: getListRegulatoryClearancesQueryKey(targetId) });

  // NDA mutations
  const createNda  = useCreateNdaRecord();
  const updateNda  = useUpdateNdaRecord();
  const deleteNda  = useDeleteNdaRecord();

  // Clearance mutations
  const createClr  = useCreateRegulatoryClearance();
  const updateClr  = useUpdateRegulatoryClearance();
  const deleteClr  = useDeleteRegulatoryClearance();

  // NDA dialog state
  const [ndaDialog, setNdaDialog] = useState<{ open: boolean; item: NdaRecord | null }>({ open: false, item: null });
  const [ndaSaving, setNdaSaving] = useState(false);
  const [deleteNdaId, setDeleteNdaId] = useState<number | null>(null);

  // Clearance dialog state
  const [clrDialog, setClrDialog] = useState<{ open: boolean; item: RegulatoryClearance | null }>({ open: false, item: null });
  const [clrSaving, setClrSaving] = useState(false);
  const [deleteClrId, setDeleteClrId] = useState<number | null>(null);

  // Collapsible state
  const [ndaOpen, setNdaOpen] = useState(true);
  const [clrOpen, setClrOpen] = useState(true);

  // Summary flags
  const anyNdaExpiring = ndas.some(n => isExpiringWithin30Days(n.expiryDate));
  const anyNdaExpired  = ndas.some(n => isExpired(n.expiryDate) || n.status === "Expired");
  const anyClrOverdue  = clearances.some(isOverdueClearing);
  const anyClrBlocked  = clearances.some(c => c.status === "Blocked");

  // ── NDA handlers ──────────────────────────────────────────────────────────

  async function handleNdaSave(data: CreateNdaRecordBody | UpdateNdaRecordBody) {
    setNdaSaving(true);
    try {
      if (ndaDialog.item) {
        await updateNda.mutateAsync({ id: ndaDialog.item.id, data });
        toast({ title: "NDA updated" });
      } else {
        await createNda.mutateAsync({ id: targetId, data: data as CreateNdaRecordBody });
        toast({ title: "NDA record added" });
      }
      await invalidateNda();
      setNdaDialog({ open: false, item: null });
    } catch {
      toast({ title: "Error saving NDA record", variant: "destructive" });
    } finally {
      setNdaSaving(false);
    }
  }

  async function handleNdaDelete() {
    if (!deleteNdaId) return;
    try {
      await deleteNda.mutateAsync({ id: deleteNdaId });
      toast({ title: "NDA record deleted" });
      await invalidateNda();
    } catch {
      toast({ title: "Error deleting NDA record", variant: "destructive" });
    } finally {
      setDeleteNdaId(null);
    }
  }

  // ── Clearance handlers ─────────────────────────────────────────────────────

  async function handleClrSave(data: CreateRegulatoryClearanceBody | UpdateRegulatoryClearanceBody) {
    setClrSaving(true);
    try {
      if (clrDialog.item) {
        await updateClr.mutateAsync({ id: clrDialog.item.id, data });
        toast({ title: "Clearance item updated" });
      } else {
        await createClr.mutateAsync({ id: targetId, data: data as CreateRegulatoryClearanceBody });
        toast({ title: "Clearance item added" });
      }
      await invalidateClr();
      setClrDialog({ open: false, item: null });
    } catch {
      toast({ title: "Error saving clearance item", variant: "destructive" });
    } finally {
      setClrSaving(false);
    }
  }

  async function handleClrDelete() {
    if (!deleteClrId) return;
    try {
      await deleteClr.mutateAsync({ id: deleteClrId });
      toast({ title: "Clearance item deleted" });
      await invalidateClr();
    } catch {
      toast({ title: "Error deleting clearance item", variant: "destructive" });
    } finally {
      setDeleteClrId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (ndaLoading || clrLoading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* Global alerts */}
      {(anyNdaExpiring || anyNdaExpired || anyClrOverdue || anyClrBlocked) && (
        <div className="flex flex-wrap gap-2 items-center px-1 py-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <AlertTriangle size={15} className="text-amber-600 shrink-0" />
          <span className="text-sm text-amber-700 font-medium">Compliance alerts:</span>
          {anyNdaExpired  && <Badge variant="destructive" className="text-xs">NDA expired</Badge>}
          {anyNdaExpiring && <Badge className="text-xs bg-amber-500 text-white border-0">NDA expiring soon</Badge>}
          {anyClrBlocked  && <Badge variant="destructive" className="text-xs">Clearance blocked</Badge>}
          {anyClrOverdue  && <Badge className="text-xs bg-orange-500 text-white border-0">Clearance overdue</Badge>}
        </div>
      )}

      {/* ── NDA Register ────────────────────────────────────────────────────── */}
      <Collapsible open={ndaOpen} onOpenChange={setNdaOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between px-1 py-2 group">
          <div className="flex items-center gap-2">
            {ndaOpen ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
            <Shield size={15} className="text-primary" />
            <span className="font-semibold text-sm">NDA Register</span>
            <Badge variant="secondary" className="text-xs">{ndas.length}</Badge>
            {anyNdaExpiring && <Badge className="text-xs bg-amber-500 text-white border-0">Expiring</Badge>}
            {anyNdaExpired  && <Badge variant="destructive" className="text-xs">Expired</Badge>}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={e => { e.stopPropagation(); setNdaDialog({ open: true, item: null }); }}>
            <Plus size={11} /> Add NDA
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {ndas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Shield size={28} className="opacity-25" />
              <p className="text-sm">No NDA records. Add the first one.</p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y divide-border overflow-hidden mt-1">
              {[...ndas].sort((a, b) => ndaUrgencyScore(a) - ndaUrgencyScore(b)).map(nda => {
                const expiring = isExpiringWithin30Days(nda.expiryDate);
                const expired  = isExpired(nda.expiryDate) || nda.status === "Expired";
                const days     = daysFromNow(nda.expiryDate);
                return (
                  <div key={nda.id} className={`flex items-start gap-3 px-4 py-3 bg-card ${expired ? "bg-destructive/5" : expiring ? "bg-amber-500/5" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-sm truncate">{nda.counterparty || "—"}</span>
                        <Badge variant={ndaStatusColor(nda) as "destructive" | "secondary" | "outline"} className="text-xs">{nda.status}</Badge>
                        <Badge variant="outline" className="text-xs">{nda.scope}</Badge>
                        {expiring && !expired && days !== null && (
                          <Badge className="text-xs bg-amber-500 text-white border-0 gap-1">
                            <Clock size={9} />{days === 0 ? "Expires today" : `Expires in ${days}d`}
                          </Badge>
                        )}
                        {expired && days !== null && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <AlertTriangle size={9} />{Math.abs(days)}d ago
                          </Badge>
                        )}
                        {expired && days === null && (
                          <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle size={9} />Expired</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                        {nda.effectiveDate && <span>Effective: {formatDate(nda.effectiveDate)}</span>}
                        {nda.expiryDate    && (
                          <span className={expired ? "text-destructive font-medium" : expiring ? "text-amber-700 font-medium" : ""}>
                            Expires: {formatDate(nda.expiryDate)}
                          </span>
                        )}
                        {nda.termMonths    && <span>Term: {nda.termMonths}mo</span>}
                        {nda.docReference  && (
                          <a href={nda.docReference.startsWith("http") ? nda.docReference : undefined}
                             target="_blank" rel="noopener noreferrer"
                             className="text-primary hover:underline truncate max-w-[200px]">
                            {nda.docReference}
                          </a>
                        )}
                      </div>
                      {nda.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{nda.notes}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setNdaDialog({ open: true, item: nda })}>
                        <Pencil size={12} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteNdaId(nda.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* ── Regulatory Clearance Map ─────────────────────────────────────────── */}
      <Collapsible open={clrOpen} onOpenChange={setClrOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between px-1 py-2 group">
          <div className="flex items-center gap-2">
            {clrOpen ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
            <ShieldCheck size={15} className="text-primary" />
            <span className="font-semibold text-sm">Regulatory Clearance Map</span>
            <Badge variant="secondary" className="text-xs">{clearances.length}</Badge>
            {anyClrOverdue  && <Badge className="text-xs bg-orange-500 text-white border-0">Overdue</Badge>}
            {anyClrBlocked  && <Badge variant="destructive" className="text-xs">Blocked</Badge>}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={e => { e.stopPropagation(); setClrDialog({ open: true, item: null }); }}>
            <Plus size={11} /> Add Clearance
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {clearances.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <ShieldCheck size={28} className="opacity-25" />
              <p className="text-sm">No regulatory clearance items. Add the first one.</p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y divide-border overflow-hidden mt-1">
              {[...clearances].sort((a, b) => clearanceUrgencyScore(a) - clearanceUrgencyScore(b)).map(clr => {
                const overdue  = isOverdueClearing(clr);
                const days     = daysFromNow(clr.targetClearanceDate);
                return (
                  <div key={clr.id} className={`flex items-start gap-3 px-4 py-3 bg-card ${clr.status === "Blocked" ? "bg-destructive/5" : overdue ? "bg-orange-500/5" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs font-mono">{clr.category}</Badge>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${clearanceStatusColor(clr.status)}`}>
                          {clr.status}
                        </span>
                        {overdue && days !== null && (
                          <Badge className="text-xs bg-orange-500 text-white border-0 gap-1">
                            <AlertTriangle size={9} />{Math.abs(days)}d overdue
                          </Badge>
                        )}
                        {overdue && days === null && (
                          <Badge className="text-xs bg-orange-500 text-white border-0 gap-1"><AlertTriangle size={9} />Overdue</Badge>
                        )}
                      </div>
                      {clr.description && <p className="text-sm truncate mb-1">{clr.description}</p>}
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                        {clr.ownerName            && <span>Owner: {clr.ownerName}</span>}
                        {clr.targetClearanceDate  && (
                          <span className={overdue ? "text-destructive font-medium" : ""}>
                            Target: {formatDate(clr.targetClearanceDate)}
                          </span>
                        )}
                        {clr.evidenceReference    && (
                          <a href={clr.evidenceReference.startsWith("http") ? clr.evidenceReference : undefined}
                             target="_blank" rel="noopener noreferrer"
                             className="text-primary hover:underline truncate max-w-[200px]">
                            {clr.evidenceReference}
                          </a>
                        )}
                      </div>
                      {clr.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{clr.notes}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => setClrDialog({ open: true, item: clr })}>
                        <Pencil size={12} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteClrId(clr.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* ── Dialogs ────────────────────────────────────────────────────────────── */}

      <NdaDialog
        open={ndaDialog.open}
        onClose={() => setNdaDialog({ open: false, item: null })}
        initial={ndaDialog.item}
        onSave={handleNdaSave}
        saving={ndaSaving}
      />

      <ClearanceDialog
        open={clrDialog.open}
        onClose={() => setClrDialog({ open: false, item: null })}
        initial={clrDialog.item}
        onSave={handleClrSave}
        saving={clrSaving}
      />

      {/* Delete NDA confirm */}
      <AlertDialog open={deleteNdaId !== null} onOpenChange={v => !v && setDeleteNdaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete NDA Record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleNdaDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete clearance confirm */}
      <AlertDialog open={deleteClrId !== null} onOpenChange={v => !v && setDeleteClrId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Clearance Item?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClrDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Badge count export (for tab label) ────────────────────────────────────────

export function useComplianceBadgeCount(targetId: number): number {
  const { data: ndas = [] } = useListNdaRecords(targetId);
  const { data: clearances = [] } = useListRegulatoryClearances(targetId);
  return (
    ndas.filter(n => isExpiringWithin30Days(n.expiryDate) || isExpired(n.expiryDate) || n.status === "Expired").length +
    clearances.filter(c => isOverdueClearing(c) || c.status === "Blocked").length
  );
}
