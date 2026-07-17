import React, { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  Download,
  ShieldAlert,
  FileX,
  Lock,
} from "lucide-react";
import type { DealDocument } from "@workspace/api-client-react";
import { format } from "date-fns";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const AUTH_KEY = "ig_os_auth_token";
function authHeaders(): Record<string, string> {
  const tok =
    typeof window !== "undefined" ? window.localStorage.getItem(AUTH_KEY) : null;
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  Public: "bg-muted/30 text-muted-foreground border-border/40",
  Internal: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Restricted: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Highly-Restricted": "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

function isPdfMime(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType?.includes("pdf"));
}

const SCALE_STEP = 0.25;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;

interface UrlState {
  loading: boolean;
  url: string | null;
  error: string | null;
  storageEnabled: boolean | null;
}

export interface DocumentPreviewDrawerProps {
  open: boolean;
  onClose: () => void;
  doc: DealDocument;
  viewerIdentity: string;
}

export function DocumentPreviewDrawer({
  open,
  onClose,
  doc,
  viewerIdentity,
}: DocumentPreviewDrawerProps) {
  const classification = doc.classification ?? "Restricted";
  const isHighlyRestricted = classification === "Highly-Restricted";
  const isPdf = isPdfMime(doc.mimeType);
  const hasFile = Boolean(doc.storagePath && doc.fileName);

  const [urlState, setUrlState] = useState<UrlState>({
    loading: false,
    url: null,
    error: null,
    storageEnabled: null,
  });
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(520);

  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setUrlState({ loading: true, url: null, error: null, storageEnabled: null });
    setCurrentPage(1);
    setNumPages(0);
    setScale(1.0);

    if (!hasFile) {
      setUrlState({ loading: false, url: null, error: null, storageEnabled: null });
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`/api/documents/${doc.id}/download-url`, {
          headers: authHeaders(),
        });

        if (res.status === 403) {
          setUrlState({
            loading: false,
            url: null,
            storageEnabled: null,
            error:
              "Access restricted — contact the deal owner to request access to this document.",
          });
          return;
        }

        if (!res.ok) {
          setUrlState({
            loading: false,
            url: null,
            storageEnabled: null,
            error: "Could not load document.",
          });
          return;
        }

        const data = (await res.json()) as {
          storageEnabled: boolean;
          signedUrl: string | null;
        };

        if (!data.storageEnabled) {
          setUrlState({
            loading: false,
            url: null,
            storageEnabled: false,
            error: null,
          });
          return;
        }

        if (!data.signedUrl) {
          setUrlState({
            loading: false,
            url: null,
            storageEnabled: true,
            error: null,
          });
          return;
        }

        setUrlState({
          loading: false,
          url: data.signedUrl,
          storageEnabled: true,
          error: null,
        });
      } catch {
        setUrlState({
          loading: false,
          url: null,
          storageEnabled: null,
          error: "Failed to load document.",
        });
      }
    })();
  }, [open, doc.id, hasFile]);

  const handleOpenNewTab = useCallback(() => {
    if (urlState.url) window.open(urlState.url, "_blank", "noopener,noreferrer");
  }, [urlState.url]);

  const classColor =
    CLASSIFICATION_COLORS[classification] ?? CLASSIFICATION_COLORS["Restricted"]!;
  const dateStr = format(new Date(), "d MMM yyyy HH:mm");
  const showToolbar = isPdf && !!urlState.url && numPages > 0;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:w-[580px] sm:max-w-[580px] flex flex-col p-0 overflow-hidden border-l border-border/60 bg-sidebar gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border/40 shrink-0">
          <div className="flex items-start gap-2 pr-8">
            <div className="flex-1 min-w-0">
              <SheetTitle className="font-mono text-sm leading-tight line-clamp-2">
                {doc.title}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono px-1.5 py-0 rounded-sm border ${classColor} flex items-center gap-1`}
                >
                  {(classification === "Restricted" ||
                    classification === "Highly-Restricted") && (
                    <Lock size={8} />
                  )}
                  {classification}
                </Badge>
                {doc.documentType && (
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-sm border border-border/40">
                    {doc.documentType}
                  </span>
                )}
                {numPages > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {numPages} page{numPages !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Highly-Restricted watermark banner */}
        {isHighlyRestricted && (
          <div className="px-4 py-2 border-b border-rose-500/30 bg-rose-500/5 flex items-start gap-2 shrink-0 select-none">
            <ShieldAlert size={12} className="text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[10px] font-mono text-rose-400 leading-relaxed">
              <strong>HIGHLY RESTRICTED</strong> · Viewer: {viewerIdentity} · {dateStr}
              {" "}· Access is logged. Do not share outside authorised deal team.
            </p>
          </div>
        )}

        {/* PDF toolbar */}
        {showToolbar && (
          <div className="px-3 py-2 border-b border-border/40 flex items-center gap-1 shrink-0 bg-sidebar/60">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-[11px] font-mono text-muted-foreground tabular-nums px-1 min-w-[64px] text-center">
              {currentPage} / {numPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm"
              disabled={currentPage >= numPages}
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              title="Next page"
            >
              <ChevronRight size={14} />
            </Button>

            <div className="flex-1" />

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm"
              disabled={scale <= MIN_SCALE}
              onClick={() =>
                setScale((s) =>
                  Math.max(MIN_SCALE, parseFloat((s - SCALE_STEP).toFixed(2)))
                )
              }
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </Button>
            <span className="text-[11px] font-mono text-muted-foreground tabular-nums w-[42px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm"
              disabled={scale >= MAX_SCALE}
              onClick={() =>
                setScale((s) =>
                  Math.min(MAX_SCALE, parseFloat((s + SCALE_STEP).toFixed(2)))
                )
              }
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </Button>

            <div className="w-px h-4 bg-border/40 mx-1" />

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm"
              onClick={handleOpenNewTab}
              title="Open in new tab"
            >
              <ExternalLink size={13} />
            </Button>
          </div>
        )}

        {/* Viewer body */}
        <div ref={containerRef} className="flex-1 overflow-auto">
          {/* Loading */}
          {urlState.loading && (
            <div className="p-6 space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-[480px] w-full rounded-sm" />
            </div>
          )}

          {/* Error */}
          {!urlState.loading && urlState.error && (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 p-8 text-center">
              <ShieldAlert size={32} className="text-rose-400/60" />
              <p className="text-[12px] font-mono text-muted-foreground max-w-xs leading-relaxed">
                {urlState.error}
              </p>
            </div>
          )}

          {/* Storage not enabled */}
          {!urlState.loading && urlState.storageEnabled === false && !urlState.error && (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 p-8 text-center">
              <FileX size={32} className="text-muted-foreground/40" />
              <p className="text-[12px] font-mono text-muted-foreground">
                File storage is not configured. Contact your administrator.
              </p>
            </div>
          )}

          {/* No file uploaded */}
          {!urlState.loading && !urlState.error && urlState.storageEnabled !== false && !hasFile && (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 p-8 text-center">
              <FileX size={32} className="text-muted-foreground/40" />
              <p className="text-[12px] font-mono text-muted-foreground">
                No file has been uploaded for this document.
              </p>
              {doc.url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-sm font-mono text-[10px] uppercase border-border"
                  onClick={() => window.open(doc.url!, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink size={11} className="mr-1.5" />
                  Open External Link
                </Button>
              )}
            </div>
          )}

          {/* Non-PDF placeholder */}
          {!urlState.loading && !urlState.error && urlState.url && !isPdf && (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8 text-center">
              <FileX size={36} className="text-muted-foreground/40" />
              <div className="space-y-1">
                <p className="text-[13px] font-mono text-foreground">
                  Preview not available
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {doc.mimeType
                    ? (doc.mimeType.split("/")[1] ?? doc.mimeType).toUpperCase()
                    : "This file type"}{" "}
                  cannot be previewed inline.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm font-mono text-[10px] uppercase border-border"
                onClick={handleOpenNewTab}
              >
                <Download size={12} className="mr-1.5" />
                Download File
              </Button>
            </div>
          )}

          {/* PDF viewer */}
          {!urlState.loading && !urlState.error && urlState.url && isPdf && (
            <div
              className="flex justify-center py-4 min-h-full"
              style={{ background: "hsl(var(--muted) / 0.2)" }}
            >
              <Document
                file={urlState.url}
                onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                onLoadError={() =>
                  setUrlState((s) => ({
                    ...s,
                    error:
                      "Failed to render PDF. The file may be corrupted or inaccessible.",
                  }))
                }
                loading={
                  <div className="p-4">
                    <Skeleton className="h-[600px] w-full rounded-sm" />
                  </div>
                }
              >
                <Page
                  pageNumber={currentPage}
                  width={Math.max(
                    100,
                    Math.round((containerWidth - 32) * scale)
                  )}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-md rounded-sm overflow-hidden"
                />
              </Document>
            </div>
          )}
        </div>

        {/* Footer — open-in-tab for non-PDF */}
        {!urlState.loading && !urlState.error && urlState.url && !isPdf && (
          <div className="px-4 py-3 border-t border-border/40 shrink-0 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm font-mono text-[10px] uppercase border-border"
              onClick={handleOpenNewTab}
            >
              <ExternalLink size={11} className="mr-1.5" />
              Open in New Tab
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
