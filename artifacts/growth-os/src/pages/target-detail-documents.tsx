import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  useListDocuments,
  getListDocumentsQueryKey,
  useCreateDocument,
  useUpdateDocument,
} from "@workspace/api-client-react";
import type { DealDocument } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, ExternalLink, Pencil, FolderOpen,
  CheckCircle2, Clock, AlertCircle, FileText,
  Upload, Download, File, Info, Lock, ShieldAlert,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const PASSWORD_KEY = "ig_os_auth_token";

function authHeaders(): Record<string, string> {
  const pw = typeof window !== "undefined" ? window.localStorage.getItem(PASSWORD_KEY) : null;
  return pw ? { Authorization: `Bearer ${pw}` } : {};
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabel(mime: string): string {
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("word") || mime.includes(".document")) return "Word";
  if (mime.includes("excel") || mime.includes(".sheet")) return "Excel";
  if (mime.includes("powerpoint") || mime.includes(".presentation")) return "PPT";
  if (mime.includes("csv")) return "CSV";
  if (mime.startsWith("image/")) return "Image";
  return "File";
}

const DOCUMENT_TYPES = [
  "Teaser",
  "IM",
  "Management Presentation",
  "NDA",
  "IOI",
  "LOI",
  "Term Sheet",
  "IC Memo",
  "Board Memo",
  "Valuation Pack",
  "Synergy Schedule",
  "Integration Plan",
  "DD Report",
  "Commercial Contract",
  "Definitive Agreement",
  "CP Register",
  "Closing Document",
  "Post-close Report",
  "Other",
] as const;

const HIGHLY_RESTRICTED_TYPES = new Set(["IC Memo", "Definitive Agreement"]);

const CLASSIFICATIONS = ["Public", "Internal", "Restricted", "Highly-Restricted"] as const;
type Classification = typeof CLASSIFICATIONS[number];

const CLASSIFICATION_COLORS: Record<Classification, string> = {
  "Public":            "bg-muted/30 text-muted-foreground border-border/40",
  "Internal":          "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Restricted":        "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Highly-Restricted": "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

const DOCUMENT_STATUSES = [
  "Requested", "Received", "Under Review", "Reviewed", "Missing", "Not Applicable",
] as const;

const WORKSTREAMS = [
  "Commercial", "Financial", "Legal", "Tax",
  "HR", "Technology", "Operations", "Integration",
] as const;

const ALLOWED_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,image/*";

const STATUS_COLORS: Record<string, string> = {
  Requested:        "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Received:         "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Under Review":   "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Reviewed:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Missing:          "bg-rose-500/10 text-rose-400 border-rose-500/20",
  "Not Applicable": "bg-muted/50 text-muted-foreground border-border",
};

const WORKSTREAM_COLORS: Record<string, string> = {
  Commercial:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Financial:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Legal:       "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Tax:         "bg-orange-500/10 text-orange-400 border-orange-500/20",
  HR:          "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Technology:  "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Operations:  "bg-rose-500/10 text-rose-400 border-rose-500/20",
  Integration: "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

type DocForm = {
  title: string;
  documentType: string;
  status: string;
  classification: string;
  owner: string;
  documentDate: string;
  url: string;
  workstream: string;
  notes: string;
};

const BLANK_FORM: DocForm = {
  title: "",
  documentType: "Other",
  status: "Requested",
  classification: "Restricted",
  owner: "",
  documentDate: "",
  url: "",
  workstream: "",
  notes: "",
};

function statusIcon(status: string) {
  if (status === "Reviewed")
    return <CheckCircle2 size={12} className="text-emerald-400 shrink-0 mt-0.5" />;
  if (status === "Missing")
    return <AlertCircle size={12} className="text-rose-400 shrink-0 mt-0.5" />;
  if (status === "Under Review" || status === "Received")
    return <Clock size={12} className="text-blue-400 shrink-0 mt-0.5" />;
  return <FileText size={12} className="text-muted-foreground shrink-0 mt-0.5" />;
}

function ClassificationBadge({ value }: { value: string }) {
  const colorClass = CLASSIFICATION_COLORS[value as Classification] ?? "bg-muted/30 text-muted-foreground border-border/40";
  return (
    <Badge
      variant="outline"
      className={`text-[10px] font-mono px-1.5 py-0 rounded-sm border ${colorClass} flex items-center gap-1`}
    >
      {(value === "Restricted" || value === "Highly-Restricted") && (
        <Lock size={8} className="shrink-0" />
      )}
      {value}
    </Badge>
  );
}

function DocModal({
  open,
  onOpenChange,
  initial,
  onSave,
  isPending,
  title: modalTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: DocForm;
  onSave: (f: DocForm) => void;
  isPending: boolean;
  title: string;
}) {
  const [form, setForm] = useState<DocForm>(initial);
  React.useEffect(() => { if (open) setForm(initial); }, [open]);

  const set = (k: keyof DocForm, v: string) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Auto-classify IC Memo and Definitive Agreement as Highly-Restricted
      if (k === "documentType" && HIGHLY_RESTRICTED_TYPES.has(v)) {
        next.classification = "Highly-Restricted";
      }
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] border-border bg-sidebar rounded-sm">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-tight text-base">{modalTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className="rounded-sm bg-background/50 text-sm"
              placeholder="e.g. 2024 Audited Financials"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Type</Label>
              <Select value={form.documentType} onValueChange={(v) => set("documentType", v)}>
                <SelectTrigger className="rounded-sm bg-background/50 text-sm h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="rounded-sm bg-background/50 text-sm h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Classification</Label>
              <Select value={form.classification} onValueChange={(v) => set("classification", v)}>
                <SelectTrigger className="rounded-sm bg-background/50 text-sm h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASSIFICATIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Workstream</Label>
              <Select
                value={form.workstream || "__none"}
                onValueChange={(v) => set("workstream", v === "__none" ? "" : v)}
              >
                <SelectTrigger className="rounded-sm bg-background/50 text-sm h-9"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {WORKSTREAMS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Owner</Label>
              <Input
                value={form.owner}
                onChange={(e) => set("owner", e.target.value)}
                className="rounded-sm bg-background/50 text-sm"
                placeholder="Name or team"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Document Date</Label>
              <Input
                type="date"
                value={form.documentDate}
                onChange={(e) => set("documentDate", e.target.value)}
                className="rounded-sm bg-background/50 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">External URL / Link</Label>
            <Input
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              className="rounded-sm bg-background/50 text-sm"
              placeholder="https://..."
            />
          </div>
          {form.classification === "Highly-Restricted" && (
            <div className="rounded-sm border border-rose-500/30 bg-rose-500/5 p-2.5 flex items-start gap-2">
              <ShieldAlert size={12} className="text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-rose-400 leading-relaxed">
                <strong>Highly-Restricted</strong> — direct downloads are blocked. Deal owner access only.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="rounded-sm bg-background/50 text-sm resize-none"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline" size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-sm font-mono text-[10px] uppercase border-border"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(form)}
            disabled={!form.title.trim() || isPending}
            className="rounded-sm font-mono text-[10px] uppercase"
          >
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocCard({
  doc,
  onEdit,
  onInvalidate,
}: {
  doc: DealDocument;
  onEdit: () => void;
  onInvalidate: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);

  const hasFile = Boolean(doc.storagePath && doc.fileName);
  const hasUrl = Boolean(doc.url);
  const classification = (doc.classification ?? "Restricted") as Classification;
  const isHighlyRestricted = classification === "Highly-Restricted";
  const isRestricted = classification === "Restricted";

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const endpoint = hasFile ? "replace-file" : "upload";
        const method = hasFile ? "PUT" : "POST";

        const res = await fetch(`/api/documents/${doc.id}/${endpoint}`, {
          method,
          headers: authHeaders(),
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.setupRequired) {
            toast({
              title: "Storage not configured",
              description: "Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Secrets to enable file uploads.",
              variant: "destructive",
            });
          } else if (data.error?.includes("not allowed")) {
            toast({
              title: "File type not allowed",
              description: "Allowed: PDF, Word, Excel, PowerPoint, CSV, images (max 25 MB).",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Upload failed",
              description: data.error ?? "Please try again",
              variant: "destructive",
            });
          }
          return;
        }

        onInvalidate();
        toast({ title: hasFile ? "File replaced" : "File uploaded successfully" });
      } catch {
        toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
      } finally {
        setUploading(false);
      }
    },
    [doc.id, hasFile, onInvalidate, toast],
  );

  const handleOpen = useCallback(async () => {
    if (isHighlyRestricted) {
      toast({
        title: "Access restricted",
        description: "This document is Highly-Restricted. Contact the deal owner to request access.",
        variant: "destructive",
      });
      return;
    }
    setOpening(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/download-url`, {
        headers: authHeaders(),
      });

      if (res.status === 403) {
        toast({
          title: "Access restricted",
          description: "This document is Highly-Restricted. Contact the deal owner to request access.",
          variant: "destructive",
        });
        return;
      }

      if (!res.ok) {
        toast({ title: "Could not get download link", variant: "destructive" });
        return;
      }

      const data = await res.json();

      if (!data.storageEnabled) {
        toast({
          title: "Storage not configured",
          description: "Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to download files.",
          variant: "destructive",
        });
        return;
      }

      if (!data.signedUrl) {
        toast({ title: "No file available", description: "This document has no uploaded file.", variant: "destructive" });
        return;
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Failed to open file", description: "Please try again", variant: "destructive" });
    } finally {
      setOpening(false);
    }
  }, [doc.id, isHighlyRestricted, toast]);

  return (
    <div
      className={`relative bg-card/30 border rounded-sm p-3 flex items-start gap-3 group transition-colors overflow-hidden
        ${isHighlyRestricted
          ? "border-rose-500/30 hover:border-rose-500/50"
          : isRestricted
            ? "border-amber-500/20 hover:border-amber-500/40"
            : "border-border/60 hover:border-border"
        }`}
      onContextMenu={isRestricted || isHighlyRestricted ? (e) => e.preventDefault() : undefined}
    >
      {/* Watermark overlay for Restricted / Highly-Restricted */}
      {(isRestricted || isHighlyRestricted) && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.04] select-none"
          aria-hidden="true"
        >
          <span
            className="font-mono font-bold uppercase tracking-widest text-foreground text-lg rotate-[-30deg] whitespace-nowrap"
          >
            {isHighlyRestricted ? "HIGHLY RESTRICTED" : "RESTRICTED"}
          </span>
        </div>
      )}

      {statusIcon(doc.status)}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[12px] text-foreground">{doc.title}</span>
              {hasUrl && !isHighlyRestricted && (
                <a
                  href={doc.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  title="Open external link"
                >
                  <ExternalLink size={11} />
                </a>
              )}
              {isHighlyRestricted && (
                <Lock size={10} className="text-rose-400 shrink-0" />
              )}
            </div>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge
                variant="outline"
                className={`text-[10px] font-mono px-1.5 py-0 rounded-sm border ${STATUS_COLORS[doc.status] ?? "bg-muted/30 text-muted-foreground border-border"}`}
              >
                {doc.status}
              </Badge>
              <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-sm border border-border/40">
                {doc.documentType}
              </span>
              <ClassificationBadge value={classification} />
              {doc.workstream && (
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono px-1.5 py-0 rounded-sm border ${WORKSTREAM_COLORS[doc.workstream] ?? "bg-muted/30 text-muted-foreground border-border"}`}
                >
                  {doc.workstream}
                </Badge>
              )}
              {doc.owner && (
                <span className="text-[10px] font-mono text-muted-foreground">· {doc.owner}</span>
              )}
              {doc.documentDate && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  · {format(parseISO(doc.documentDate), "d MMM yyyy")}
                </span>
              )}
            </div>

            {hasFile && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <File size={10} className="text-primary/60 shrink-0" />
                <span className="text-[10px] font-mono text-primary/80 truncate max-w-[200px]">{doc.fileName}</span>
                {doc.fileSize != null && (
                  <span className="text-[10px] font-mono text-muted-foreground">{formatBytes(doc.fileSize)}</span>
                )}
                {doc.mimeType && (
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted/20 px-1 py-0.5 rounded-sm border border-border/30">
                    {mimeLabel(doc.mimeType)}
                  </span>
                )}
                {doc.uploadedAt && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    · uploaded {format(parseISO(doc.uploadedAt), "d MMM yyyy")}
                  </span>
                )}
              </div>
            )}

            {doc.notes && (
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{doc.notes}</p>
            )}

            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {/* Highly-Restricted: show "Request Access" notice instead of download */}
              {isHighlyRestricted ? (
                <div className="flex items-center gap-1.5 rounded-sm border border-rose-500/30 bg-rose-500/5 px-2 py-1">
                  <Lock size={9} className="text-rose-400" />
                  <span className="text-[10px] font-mono text-rose-400">
                    Highly-Restricted — contact deal owner to access
                  </span>
                </div>
              ) : (
                hasFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 rounded-sm font-mono text-[10px] uppercase border-border/60 px-2"
                    onClick={handleOpen}
                    disabled={opening}
                  >
                    <Download size={10} className="mr-1" />
                    {opening ? "Opening..." : "Open File"}
                  </Button>
                )
              )}
              {/* Upload allowed regardless of classification (admins manage classification) */}
              <Button
                variant="outline"
                size="sm"
                className="h-6 rounded-sm font-mono text-[10px] uppercase border-border/60 px-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={10} className="mr-1" />
                {uploading ? "Uploading..." : hasFile ? "Replace File" : "Upload File"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 rounded-sm"
            onClick={onEdit}
          >
            <Pencil size={12} />
          </Button>
        </div>
      </div>
    </div>
  );
}

type StorageConfig = { storageEnabled: boolean; missingSecrets: string[] } | null;

export function DocumentsTab({ targetId }: { targetId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: docs, isLoading } = useListDocuments(targetId);
  const createDoc = useCreateDocument();
  const updateDoc = useUpdateDocument();

  const [addOpen, setAddOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<DealDocument | null>(null);
  const [storageConfig, setStorageConfig] = useState<StorageConfig>(null);

  useEffect(() => {
    fetch("/api/documents/storage-config", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setStorageConfig(d))
      .catch(() => setStorageConfig(null));
  }, []);

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: getListDocumentsQueryKey(targetId) }),
    [qc, targetId],
  );

  const total    = docs?.length ?? 0;
  const missing  = docs?.filter((d) => d.status === "Missing" || d.status === "Requested").length ?? 0;
  const inFlight = docs?.filter((d) => d.status === "Received" || d.status === "Under Review").length ?? 0;
  const reviewed = docs?.filter((d) => d.status === "Reviewed").length ?? 0;
  const highlyRestricted = docs?.filter((d) => d.classification === "Highly-Restricted").length ?? 0;

  const handleAdd = (form: DocForm) => {
    createDoc.mutate(
      {
        id: targetId,
        data: {
          title: form.title,
          documentType: form.documentType || "Other",
          status: form.status || "Requested",
          classification: form.classification || "Restricted",
          owner: form.owner || null,
          documentDate: form.documentDate || null,
          url: form.url || null,
          workstream: form.workstream || null,
          notes: form.notes || null,
        },
      },
      {
        onSuccess: () => { toast({ title: "Document added" }); setAddOpen(false); invalidate(); },
        onError: () => toast({ title: "Error", description: "Could not add document", variant: "destructive" }),
      },
    );
  };

  const handleEdit = (form: DocForm) => {
    if (!editDoc) return;
    updateDoc.mutate(
      {
        id: editDoc.id,
        data: {
          title: form.title,
          documentType: form.documentType || undefined,
          status: form.status || undefined,
          classification: form.classification || undefined,
          owner: form.owner || null,
          documentDate: form.documentDate || null,
          url: form.url || null,
          workstream: form.workstream || null,
          notes: form.notes || null,
        },
      },
      {
        onSuccess: () => { toast({ title: "Document updated" }); setEditDoc(null); invalidate(); },
        onError: () => toast({ title: "Error", description: "Could not update document", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4">
      {storageConfig && !storageConfig.storageEnabled && (
        <div className="rounded-sm border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
          <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-[11px] font-mono text-amber-400 font-semibold uppercase tracking-wide">
              File Storage Not Configured
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              External URL tracking is fully active. To enable secure file uploads, add these secrets in your Replit project:
            </p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {storageConfig.missingSecrets.map((s) => (
                <span
                  key={s}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-400 border border-amber-500/20"
                >
                  {s}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Also create a private Supabase Storage bucket named <span className="font-mono text-foreground">deal-documents</span>.
            </p>
          </div>
        </div>
      )}

      {!isLoading && total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "Total",               value: total,             color: "text-foreground" },
            { label: "Missing / Requested", value: missing,           color: missing          > 0 ? "text-rose-400" : "text-muted-foreground" },
            { label: "In Flight",           value: inFlight,          color: inFlight         > 0 ? "text-blue-400" : "text-muted-foreground" },
            { label: "Reviewed",            value: reviewed,          color: reviewed         > 0 ? "text-emerald-400" : "text-muted-foreground" },
          ].map(({ label, value, color }) => (
            <Card key={label} className="bg-card/30 border-border/50 rounded-sm p-3 text-center">
              <div className={`text-xl font-mono font-semibold ${color}`}>{value}</div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Highly-Restricted alert banner */}
      {!isLoading && highlyRestricted > 0 && (
        <div className="rounded-sm border border-rose-500/30 bg-rose-500/5 p-2.5 flex items-center gap-2">
          <ShieldAlert size={12} className="text-rose-400 shrink-0" />
          <p className="text-[11px] font-mono text-rose-400">
            {highlyRestricted} Highly-Restricted document{highlyRestricted > 1 ? "s" : ""} in this vault — downloads blocked. Contact deal owner for access.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm" variant="outline"
          className="hidden md:flex rounded-sm font-mono text-[10px] uppercase border-border"
          onClick={() => setAddOpen(true)}
        >
          <Plus size={13} className="mr-1" /> Add Document
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : !docs?.length ? (
        <div className="border border-dashed border-border rounded-sm py-16 text-center space-y-3">
          <FolderOpen size={28} className="mx-auto text-muted-foreground/40" />
          <div className="text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
            No documents tracked yet
          </div>
          <Button
            size="sm" variant="outline"
            className="rounded-sm font-mono text-[10px] uppercase border-border"
            onClick={() => setAddOpen(true)}
          >
            <Plus size={13} className="mr-1" /> Add First Document
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onEdit={() => setEditDoc(doc)}
              onInvalidate={invalidate}
            />
          ))}
        </div>
      )}

      <div className="md:hidden fixed bottom-20 right-4 z-40">
        <Button size="icon" className="h-12 w-12 rounded-full shadow-lg" onClick={() => setAddOpen(true)}>
          <Plus size={20} />
        </Button>
      </div>

      <DocModal
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={BLANK_FORM}
        onSave={handleAdd}
        isPending={createDoc.isPending}
        title="Add Document"
      />

      <DocModal
        open={!!editDoc}
        onOpenChange={(v) => { if (!v) setEditDoc(null); }}
        initial={
          editDoc
            ? {
                title:          editDoc.title,
                documentType:   editDoc.documentType,
                status:         editDoc.status,
                classification: editDoc.classification ?? "Restricted",
                owner:          editDoc.owner ?? "",
                documentDate:   editDoc.documentDate ?? "",
                url:            editDoc.url ?? "",
                workstream:     editDoc.workstream ?? "",
                notes:          editDoc.notes ?? "",
              }
            : BLANK_FORM
        }
        onSave={handleEdit}
        isPending={updateDoc.isPending}
        title="Edit Document"
      />
    </div>
  );
}
