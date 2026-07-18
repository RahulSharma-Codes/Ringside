import React, { useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCounterparty, getGetCounterpartyQueryKey, useUpdateCounterparty,
  useListAdvisors, getListAdvisorsQueryKey, useCreateAdvisor, useUpdateAdvisor, useDeleteAdvisor,
  useListAdvisorConflictNotes, getListAdvisorConflictNotesQueryKey, useCreateAdvisorConflictNote,
  useListSponsors, getListSponsorsQueryKey, useCreateSponsor, useUpdateSponsor, useDeleteSponsor,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
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
import {
  Users, Briefcase, Edit, Trash2, Plus, AlertTriangle, Building2, Shield,
  ChevronDown, ChevronRight, FileText,
} from "lucide-react";

const ADVISOR_TYPES = [
  "Buy-side Banker", "Sell-side Banker", "Legal Counsel", "Tax Advisor",
  "Commercial DD", "ESG Advisor", "Cyber DD", "Integration Advisor", "Other",
] as const;

const CONFLICTS_STATUSES = ["Pending", "Cleared", "Flagged"] as const;

type AdvisorType = typeof ADVISOR_TYPES[number];
type ConflictsStatus = typeof CONFLICTS_STATUSES[number];

interface AdvisorFormState {
  side: "buy-side" | "sell-side";
  advisorType: AdvisorType;
  firmName: string;
  contactName: string;
  contactEmail: string;
  engagementDate: string;
  feeStructure: string;
  conflictsStatus: ConflictsStatus;
  notes: string;
}

const ADVISOR_DEFAULTS: AdvisorFormState = {
  side: "buy-side",
  advisorType: "Legal Counsel",
  firmName: "",
  contactName: "",
  contactEmail: "",
  engagementDate: "",
  feeStructure: "",
  conflictsStatus: "Pending",
  notes: "",
};

interface SponsorFormState {
  name: string;
  roleTitle: string;
  email: string;
  notes: string;
}

const SPONSOR_DEFAULTS: SponsorFormState = { name: "", roleTitle: "", email: "", notes: "" };

interface CounterpartyFormState {
  cpCin: string;
  cpFounders: string;
  cpKeyManagement: string;
  cpControllingShareholderS: string;
  cpWebsite: string;
  cpNotes: string;
}

function conflictsBadge(status: string) {
  if (status === "Flagged")
    return <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-sm bg-destructive/10 text-destructive border-destructive/25">Flagged</Badge>;
  if (status === "Cleared")
    return <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-sm bg-emerald-500/10 text-emerald-500 border-emerald-500/25">Cleared</Badge>;
  return <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-sm text-muted-foreground">Pending</Badge>;
}

function sideBadge(side: string) {
  if (side === "sell-side")
    return <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-sm bg-amber-500/10 text-amber-500 border-amber-500/25">Sell-side</Badge>;
  return <Badge variant="outline" className="font-mono text-[10px] uppercase rounded-sm bg-sky-500/10 text-sky-500 border-sky-500/25">Buy-side</Badge>;
}

export function StakeholdersTab({ targetId }: { targetId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Counterparty ────────────────────────────────────────────────────────────
  const { data: cpData, isLoading: cpLoading } = useGetCounterparty(targetId);
  const [cpEditOpen, setCpEditOpen] = useState(false);
  const [cpForm, setCpForm] = useState<CounterpartyFormState>({
    cpCin: "", cpFounders: "", cpKeyManagement: "",
    cpControllingShareholderS: "", cpWebsite: "", cpNotes: "",
  });

  const updateCp = useUpdateCounterparty({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCounterpartyQueryKey(targetId) });
        setCpEditOpen(false);
        toast({ title: "Counterparty updated" });
      },
      onError: () => toast({ title: "Error", description: "Could not update counterparty", variant: "destructive" }),
    },
  });

  function openCpEdit() {
    setCpForm({
      cpCin: (cpData?.cpCin as string) ?? "",
      cpFounders: (cpData?.cpFounders as string) ?? "",
      cpKeyManagement: (cpData?.cpKeyManagement as string) ?? "",
      cpControllingShareholderS: (cpData?.cpControllingShareholderS as string) ?? "",
      cpWebsite: (cpData?.cpWebsite as string) ?? "",
      cpNotes: (cpData?.cpNotes as string) ?? "",
    });
    setCpEditOpen(true);
  }

  // ── Advisors ────────────────────────────────────────────────────────────────
  const { data: advisors = [], isLoading: advisorsLoading } = useListAdvisors(targetId);
  const [advisorAddOpen, setAdvisorAddOpen] = useState(false);
  const [advisorEditOpen, setAdvisorEditOpen] = useState(false);
  const [advisorDeleteOpen, setAdvisorDeleteOpen] = useState(false);
  const [editingAdvisorId, setEditingAdvisorId] = useState<number | null>(null);
  const [deletingAdvisorId, setDeletingAdvisorId] = useState<number | null>(null);
  const [advisorForm, setAdvisorForm] = useState<AdvisorFormState>(ADVISOR_DEFAULTS);
  const [advisorSideFilter, setAdvisorSideFilter] = useState<"all" | "buy-side" | "sell-side">("all");

  const createAdvisor = useCreateAdvisor({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAdvisorsQueryKey(targetId) });
        setAdvisorAddOpen(false);
        setAdvisorForm(ADVISOR_DEFAULTS);
        toast({ title: "Advisor added" });
      },
      onError: () => toast({ title: "Error", description: "Could not add advisor", variant: "destructive" }),
    },
  });

  const updateAdvisor = useUpdateAdvisor({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAdvisorsQueryKey(targetId) });
        setAdvisorEditOpen(false);
        toast({ title: "Advisor updated" });
      },
      onError: () => toast({ title: "Error", description: "Could not update advisor", variant: "destructive" }),
    },
  });

  const deleteAdvisor = useDeleteAdvisor({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListAdvisorsQueryKey(targetId) });
        setAdvisorDeleteOpen(false);
        toast({ title: "Advisor removed" });
      },
      onError: () => toast({ title: "Error", description: "Could not remove advisor", variant: "destructive" }),
    },
  });

  function openEditAdvisor(id: number) {
    const a = advisors.find((x: any) => x.id === id);
    if (!a) return;
    setEditingAdvisorId(id);
    setAdvisorForm({
      side: (a as any).side ?? "buy-side",
      advisorType: (a as any).advisorType ?? "Legal Counsel",
      firmName: (a as any).firmName ?? "",
      contactName: (a as any).contactName ?? "",
      contactEmail: (a as any).contactEmail ?? "",
      engagementDate: (a as any).engagementDate ?? "",
      feeStructure: (a as any).feeStructure ?? "",
      conflictsStatus: (a as any).conflictsStatus ?? "Pending",
      notes: (a as any).notes ?? "",
    });
    setAdvisorEditOpen(true);
  }

  // ── Conflict resolution notes ────────────────────────────────────────────────
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteAdvisorId, setNoteAdvisorId] = useState<number | null>(null);
  const [noteAdvisorStatus, setNoteAdvisorStatus] = useState<string>("Flagged");
  const [noteForm, setNoteForm] = useState({ note: "", author: "" });
  const [expandedAdvisorNotes, setExpandedAdvisorNotes] = useState<Set<number>>(new Set());

  const createConflictNote = useCreateAdvisorConflictNote({
    mutation: {
      onSuccess: (_, vars) => {
        qc.invalidateQueries({ queryKey: getListAdvisorConflictNotesQueryKey(vars.id) });
        setNoteDialogOpen(false);
        setNoteForm({ note: "", author: "" });
        toast({ title: "Resolution note added" });
        setExpandedAdvisorNotes((prev) => new Set([...prev, vars.id]));
      },
      onError: () => toast({ title: "Error", description: "Could not add note", variant: "destructive" }),
    },
  });

  function openNoteDialog(advisorId: number, conflictsStatus: string) {
    setNoteAdvisorId(advisorId);
    setNoteAdvisorStatus(conflictsStatus);
    setNoteForm({ note: "", author: "" });
    setNoteDialogOpen(true);
  }

  function toggleAdvisorNotes(advisorId: number) {
    setExpandedAdvisorNotes((prev) => {
      const next = new Set(prev);
      if (next.has(advisorId)) next.delete(advisorId);
      else next.add(advisorId);
      return next;
    });
  }

  // ── Sponsors ────────────────────────────────────────────────────────────────
  const { data: sponsors = [], isLoading: sponsorsLoading } = useListSponsors(targetId);
  const [sponsorAddOpen, setSponsorAddOpen] = useState(false);
  const [sponsorEditOpen, setSponsorEditOpen] = useState(false);
  const [sponsorDeleteOpen, setSponsorDeleteOpen] = useState(false);
  const [editingSponsorId, setEditingSponsorId] = useState<number | null>(null);
  const [deletingSponsorId, setDeletingSponsorId] = useState<number | null>(null);
  const [sponsorForm, setSponsorForm] = useState<SponsorFormState>(SPONSOR_DEFAULTS);

  const createSponsor = useCreateSponsor({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSponsorsQueryKey(targetId) });
        setSponsorAddOpen(false);
        setSponsorForm(SPONSOR_DEFAULTS);
        toast({ title: "Sponsor added" });
      },
      onError: () => toast({ title: "Error", description: "Could not add sponsor", variant: "destructive" }),
    },
  });

  const updateSponsor = useUpdateSponsor({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSponsorsQueryKey(targetId) });
        setSponsorEditOpen(false);
        toast({ title: "Sponsor updated" });
      },
      onError: () => toast({ title: "Error", description: "Could not update sponsor", variant: "destructive" }),
    },
  });

  const deleteSponsor = useDeleteSponsor({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSponsorsQueryKey(targetId) });
        setSponsorDeleteOpen(false);
        toast({ title: "Sponsor removed" });
      },
      onError: () => toast({ title: "Error", description: "Could not remove sponsor", variant: "destructive" }),
    },
  });

  function openEditSponsor(id: number) {
    const s = sponsors.find((x: any) => x.id === id);
    if (!s) return;
    setEditingSponsorId(id);
    setSponsorForm({
      name: (s as any).name ?? "",
      roleTitle: (s as any).roleTitle ?? "",
      email: (s as any).email ?? "",
      notes: (s as any).notes ?? "",
    });
    setSponsorEditOpen(true);
  }

  // ── Flagged warning ─────────────────────────────────────────────────────────
  const flaggedAdvisors = (advisors as any[]).filter((a: any) => a.conflictsStatus === "Flagged");

  const buyAdvisors = (advisors as any[]).filter((a: any) =>
    advisorSideFilter === "all" ? a.side === "buy-side" : advisorSideFilter === "buy-side",
  );
  const sellAdvisors = (advisors as any[]).filter((a: any) =>
    advisorSideFilter === "all" ? a.side === "sell-side" : advisorSideFilter === "sell-side",
  );
  const visibleBuyAdvisors = advisorSideFilter === "sell-side" ? [] :
    (advisors as any[]).filter((a: any) => a.side === "buy-side");
  const visibleSellAdvisors = advisorSideFilter === "buy-side" ? [] :
    (advisors as any[]).filter((a: any) => a.side === "sell-side");

  return (
    <div className="space-y-6">
      {/* Flagged advisor warning */}
      {flaggedAdvisors.length > 0 && (
        <div className="flex items-start gap-3 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle size={15} className="text-destructive mt-0.5 shrink-0" />
          <div className="text-sm text-destructive/90">
            <span className="font-semibold">Conflicts flagged: </span>
            {flaggedAdvisors.map((a: any) => `${a.firmName} (${a.advisorType})`).join(", ")}
          </div>
        </div>
      )}

      {/* ── Counterparty ── */}
      <Card className="bg-card/30 border-border rounded-sm">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2">
              <Building2 size={13} /> Counterparty Entity
            </CardTitle>
            <Button size="sm" variant="ghost" className="h-7 px-2 font-mono text-[10px] uppercase" onClick={openCpEdit}>
              <Edit size={11} className="mr-1" /> Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {cpLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {[
                { label: "Legal Name", value: (cpData as any)?.legalName },
                { label: "CIN / Reg No.", value: (cpData as any)?.cpCin },
                { label: "Founders", value: (cpData as any)?.cpFounders },
                { label: "Key Management", value: (cpData as any)?.cpKeyManagement },
                { label: "Controlling Shareholders", value: (cpData as any)?.cpControllingShareholderS },
                { label: "Website", value: (cpData as any)?.cpWebsite },
              ].map(({ label, value }) => (
                <div key={label} className="space-y-0.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">{label}</div>
                  <div className="text-sm text-foreground/80">
                    {value ? (
                      label === "Website" ? (
                        <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{value}</a>
                      ) : value
                    ) : (
                      <span className="text-muted-foreground/40 italic text-xs">—</span>
                    )}
                  </div>
                </div>
              ))}
              {(cpData as any)?.cpNotes && (
                <div className="md:col-span-2 space-y-0.5 mt-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">Notes</div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{(cpData as any).cpNotes}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Internal Sponsors ── */}
      <Card className="bg-card/30 border-border rounded-sm">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2">
              <Shield size={13} /> Internal Sponsors
            </CardTitle>
            <Button size="sm" variant="outline" className="rounded-sm font-mono text-[10px] uppercase border-border h-7 px-2" onClick={() => { setSponsorForm(SPONSOR_DEFAULTS); setSponsorAddOpen(true); }}>
              <Plus size={11} className="mr-1" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {sponsorsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : !(sponsors as any[]).length ? (
            <div className="border border-dashed border-border rounded-sm py-10 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest flex flex-col items-center gap-2">
              <Users size={18} className="text-muted-foreground/30" />
              No internal sponsors
            </div>
          ) : (
            <div className="space-y-2">
              {(sponsors as any[]).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{s.name}</span>
                      {s.roleTitle && <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-wide">{s.roleTitle}</span>}
                    </div>
                    {s.email && <div className="text-xs text-muted-foreground mt-0.5">{s.email}</div>}
                    {s.notes && <div className="text-xs text-muted-foreground/70 mt-0.5 italic">{s.notes}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditSponsor(s.id)}>
                      <Edit size={11} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => { setDeletingSponsorId(s.id); setSponsorDeleteOpen(true); }}>
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Our Advisors ── */}
      <Card className="bg-card/30 border-border rounded-sm">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2">
              <Briefcase size={13} /> Our Advisors (Buy-side)
            </CardTitle>
            <Button size="sm" variant="outline" className="rounded-sm font-mono text-[10px] uppercase border-border h-7 px-2"
              onClick={() => { setAdvisorForm({ ...ADVISOR_DEFAULTS, side: "buy-side" }); setAdvisorAddOpen(true); }}>
              <Plus size={11} className="mr-1" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {advisorsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : !visibleBuyAdvisors.length ? (
            <div className="border border-dashed border-border rounded-sm py-10 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest flex flex-col items-center gap-2">
              <Briefcase size={18} className="text-muted-foreground/30" />
              No advisors added
            </div>
          ) : (
            <div className="space-y-0">
              {visibleBuyAdvisors.map((a: any) => (
                <AdvisorRow
                  key={a.id}
                  advisor={a}
                  onEdit={() => openEditAdvisor(a.id)}
                  onDelete={() => { setDeletingAdvisorId(a.id); setAdvisorDeleteOpen(true); }}
                  onAddNote={() => openNoteDialog(a.id, a.conflictsStatus)}
                  notesExpanded={expandedAdvisorNotes.has(a.id)}
                  onToggleNotes={() => toggleAdvisorNotes(a.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Counterparty Advisors ── */}
      <Card className="bg-card/30 border-border rounded-sm">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2">
              <Briefcase size={13} /> Counterparty Advisors (Sell-side)
            </CardTitle>
            <Button size="sm" variant="outline" className="rounded-sm font-mono text-[10px] uppercase border-border h-7 px-2"
              onClick={() => { setAdvisorForm({ ...ADVISOR_DEFAULTS, side: "sell-side" }); setAdvisorAddOpen(true); }}>
              <Plus size={11} className="mr-1" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {advisorsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : !visibleSellAdvisors.length ? (
            <div className="border border-dashed border-border rounded-sm py-10 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest flex flex-col items-center gap-2">
              <Briefcase size={18} className="text-muted-foreground/30" />
              No counterparty advisors tracked
            </div>
          ) : (
            <div className="space-y-0">
              {visibleSellAdvisors.map((a: any) => (
                <AdvisorRow
                  key={a.id}
                  advisor={a}
                  onEdit={() => openEditAdvisor(a.id)}
                  onDelete={() => { setDeletingAdvisorId(a.id); setAdvisorDeleteOpen(true); }}
                  onAddNote={() => openNoteDialog(a.id, a.conflictsStatus)}
                  notesExpanded={expandedAdvisorNotes.has(a.id)}
                  onToggleNotes={() => toggleAdvisorNotes(a.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Counterparty Edit Dialog ── */}
      <Dialog open={cpEditOpen} onOpenChange={setCpEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Edit Counterparty</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2">
            {([
              { key: "cpCin", label: "CIN / Registration No." },
              { key: "cpFounders", label: "Founders (comma-separated)" },
              { key: "cpKeyManagement", label: "Key Management (comma-separated)" },
              { key: "cpControllingShareholderS", label: "Controlling Shareholders" },
              { key: "cpWebsite", label: "Website" },
            ] as { key: keyof CounterpartyFormState; label: string }[]).map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</label>
                <Input
                  value={cpForm[key]}
                  onChange={(e) => setCpForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="h-8 text-sm font-mono"
                  placeholder={label}
                />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Notes</label>
              <Textarea
                value={cpForm.cpNotes}
                onChange={(e) => setCpForm((f) => ({ ...f, cpNotes: e.target.value }))}
                className="text-sm font-mono resize-none"
                rows={3}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCpEditOpen(false)}>Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
            <Button
              disabled={updateCp.isPending}
              onClick={() => updateCp.mutate({ id: targetId, data: {
                cpCin: cpForm.cpCin || null,
                cpFounders: cpForm.cpFounders || null,
                cpKeyManagement: cpForm.cpKeyManagement || null,
                cpControllingShareholderS: cpForm.cpControllingShareholderS || null,
                cpWebsite: cpForm.cpWebsite || null,
                cpNotes: cpForm.cpNotes || null,
              } })}
            >
              Save
            </Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Advisor Add/Edit Dialog ── */}
      <Dialog open={advisorAddOpen || advisorEditOpen} onOpenChange={(open) => { if (!open) { setAdvisorAddOpen(false); setAdvisorEditOpen(false); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">{advisorEditOpen ? "Edit Advisor" : "Add Advisor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Side</label>
                <Select value={advisorForm.side} onValueChange={(v) => setAdvisorForm((f) => ({ ...f, side: v as any }))}>
                  <SelectTrigger className="h-8 text-sm font-sans"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy-side">Buy-side (Ours)</SelectItem>
                    <SelectItem value="sell-side">Sell-side (Counterparty)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Conflicts Status</label>
                <Select value={advisorForm.conflictsStatus} onValueChange={(v) => setAdvisorForm((f) => ({ ...f, conflictsStatus: v as any }))}>
                  <SelectTrigger className="h-8 text-sm font-sans"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONFLICTS_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Advisor Type</label>
              <Select value={advisorForm.advisorType} onValueChange={(v) => setAdvisorForm((f) => ({ ...f, advisorType: v as any }))}>
                <SelectTrigger className="h-8 text-sm font-sans"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADVISOR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {([
              { key: "firmName", label: "Firm Name", required: true },
              { key: "contactName", label: "Lead Contact Name" },
              { key: "contactEmail", label: "Lead Contact Email" },
              { key: "engagementDate", label: "Engagement Letter Date (YYYY-MM-DD)" },
              { key: "feeStructure", label: "Fee Structure" },
            ] as { key: keyof AdvisorFormState; label: string; required?: boolean }[]).map(({ key, label, required }) => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}{required && " *"}</label>
                <Input
                  value={advisorForm[key] as string}
                  onChange={(e) => setAdvisorForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="h-8 text-sm font-mono"
                  placeholder={label}
                />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Notes</label>
              <Textarea
                value={advisorForm.notes}
                onChange={(e) => setAdvisorForm((f) => ({ ...f, notes: e.target.value }))}
                className="text-sm font-mono resize-none"
                rows={2}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAdvisorAddOpen(false); setAdvisorEditOpen(false); }}>Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
            <Button
              disabled={!advisorForm.firmName || createAdvisor.isPending || updateAdvisor.isPending}
              onClick={() => {
                const payload = {
                  side: advisorForm.side,
                  advisorType: advisorForm.advisorType,
                  firmName: advisorForm.firmName,
                  contactName: advisorForm.contactName || null,
                  contactEmail: advisorForm.contactEmail || null,
                  engagementDate: advisorForm.engagementDate || null,
                  feeStructure: advisorForm.feeStructure || null,
                  conflictsStatus: advisorForm.conflictsStatus,
                  notes: advisorForm.notes || null,
                };
                if (advisorEditOpen && editingAdvisorId != null) {
                  updateAdvisor.mutate({ id: editingAdvisorId, data: payload });
                } else {
                  createAdvisor.mutate({ id: targetId, data: payload });
                }
              }}
            >
              {advisorEditOpen ? "Save" : "Add Advisor"}
            </Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Advisor Delete Dialog ── */}
      <AlertDialog open={advisorDeleteOpen} onOpenChange={setAdvisorDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono uppercase text-destructive">Remove Advisor?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this advisor record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingAdvisorId != null && deleteAdvisor.mutate({ id: deletingAdvisorId })}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Add Resolution Note Dialog ── */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">Add Resolution Note</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2">
            <div className="flex items-center gap-2 rounded-sm border border-border/50 bg-muted/30 px-3 py-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Status at time:</span>
              <span className="ml-1">{conflictsBadge(noteAdvisorStatus)}</span>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Author *</label>
              <Input
                value={noteForm.author}
                onChange={(e) => setNoteForm((f) => ({ ...f, author: e.target.value }))}
                className="h-8 text-sm font-mono"
                placeholder="Your name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Note *</label>
              <Textarea
                value={noteForm.note}
                onChange={(e) => setNoteForm((f) => ({ ...f, note: e.target.value }))}
                className="text-sm font-mono resize-none"
                rows={4}
                placeholder="Describe the investigation steps taken and how this conflict was resolved or is being managed…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteDialogOpen(false)}>Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
            <Button
              disabled={!noteForm.note.trim() || !noteForm.author.trim() || createConflictNote.isPending}
              onClick={() => {
                if (noteAdvisorId == null) return;
                createConflictNote.mutate({
                  id: noteAdvisorId,
                  data: { note: noteForm.note, author: noteForm.author, statusAtTime: noteAdvisorStatus as any },
                });
              }}
            >
              Save Note
            </Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sponsor Add/Edit Dialog ── */}
      <Dialog open={sponsorAddOpen || sponsorEditOpen} onOpenChange={(open) => { if (!open) { setSponsorAddOpen(false); setSponsorEditOpen(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase tracking-tight text-lg">{sponsorEditOpen ? "Edit Sponsor" : "Add Sponsor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-2">
            {([
              { key: "name", label: "Name", required: true },
              { key: "roleTitle", label: "Role / Title" },
              { key: "email", label: "Email" },
            ] as { key: keyof SponsorFormState; label: string; required?: boolean }[]).map(({ key, label, required }) => (
              <div key={key} className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}{required && " *"}</label>
                <Input
                  value={sponsorForm[key]}
                  onChange={(e) => setSponsorForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="h-8 text-sm font-mono"
                  placeholder={label}
                />
              </div>
            ))}
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Notes</label>
              <Textarea
                value={sponsorForm.notes}
                onChange={(e) => setSponsorForm((f) => ({ ...f, notes: e.target.value }))}
                className="text-sm font-mono resize-none"
                rows={2}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setSponsorAddOpen(false); setSponsorEditOpen(false); }}>Cancel</Button>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
            <Button
              disabled={!sponsorForm.name || createSponsor.isPending || updateSponsor.isPending}
              onClick={() => {
                const payload = {
                  name: sponsorForm.name,
                  roleTitle: sponsorForm.roleTitle || null,
                  email: sponsorForm.email || null,
                  notes: sponsorForm.notes || null,
                };
                if (sponsorEditOpen && editingSponsorId != null) {
                  updateSponsor.mutate({ id: editingSponsorId, data: payload });
                } else {
                  createSponsor.mutate({ id: targetId, data: payload });
                }
              }}
            >
              {sponsorEditOpen ? "Save" : "Add Sponsor"}
            </Button>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sponsor Delete Dialog ── */}
      <AlertDialog open={sponsorDeleteOpen} onOpenChange={setSponsorDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono uppercase text-destructive">Remove Sponsor?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this sponsor record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingSponsorId != null && deleteSponsor.mutate({ id: deletingSponsorId })}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AdvisorNotesList({ advisorId }: { advisorId: number }) {
  const { data: notes = [], isLoading } = useListAdvisorConflictNotes(advisorId);
  if (isLoading) return <div className="py-2 px-3"><Skeleton className="h-8 w-full" /></div>;
  if (!(notes as any[]).length) {
    return (
      <div className="py-2 px-3 text-[11px] font-mono text-muted-foreground/50 italic">
        No resolution notes yet
      </div>
    );
  }
  return (
    <div className="space-y-0 border-t border-border/30 mt-1">
      {(notes as any[]).map((n: any) => (
        <div key={n.id} className="flex items-start gap-3 px-3 py-2 border-b border-border/20 last:border-0 bg-muted/20">
          <div className="mt-0.5 shrink-0">
            <FileText size={11} className="text-muted-foreground/50" />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-semibold text-foreground/80">{n.author}</span>
              <span className="text-[10px] font-mono text-muted-foreground/50">
                {new Date(n.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
              {conflictsBadge(n.statusAtTime)}
            </div>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{n.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdvisorRow({
  advisor,
  onEdit,
  onDelete,
  onAddNote,
  notesExpanded,
  onToggleNotes,
}: {
  advisor: any;
  onEdit: () => void;
  onDelete: () => void;
  onAddNote: () => void;
  notesExpanded: boolean;
  onToggleNotes: () => void;
}) {
  const showNoteControls = advisor.conflictsStatus === "Flagged" || advisor.conflictsStatus === "Cleared";
  return (
    <div className="border-b border-border/40 last:border-0">
      <div className="flex items-start justify-between gap-3 py-2 group">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{advisor.firmName}</span>
            <span className="text-[10px] font-mono text-muted-foreground/70 uppercase tracking-wide">{advisor.advisorType}</span>
            {conflictsBadge(advisor.conflictsStatus)}
          </div>
          {advisor.contactName && (
            <div className="text-xs text-muted-foreground">
              {advisor.contactName}
              {advisor.contactEmail && <span className="text-muted-foreground/60"> · {advisor.contactEmail}</span>}
            </div>
          )}
          {advisor.feeStructure && (
            <div className="text-xs text-muted-foreground/70 italic">{advisor.feeStructure}</div>
          )}
          {advisor.notes && (
            <div className="text-xs text-muted-foreground/60">{advisor.notes}</div>
          )}
          {showNoteControls && (
            <div className="flex items-center gap-2 pt-0.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
                onClick={onToggleNotes}
              >
                {notesExpanded ? <ChevronDown size={10} className="mr-1" /> : <ChevronRight size={10} className="mr-1" />}
                Resolution Log
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 font-mono text-[10px] uppercase text-primary/80 hover:text-primary"
                onClick={onAddNote}
              >
                <Plus size={10} className="mr-1" /> Add Note
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
            <Edit size={11} />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={onDelete}>
            <Trash2 size={11} />
          </Button>
        </div>
      </div>
      {showNoteControls && notesExpanded && (
        <AdvisorNotesList advisorId={advisor.id} />
      )}
    </div>
  );
}
