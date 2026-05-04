import React, { useState } from "react";
import { Link } from "wouter";
import { useGetDocumentReview } from "@workspace/api-client-react";
import type { DocumentReviewItem, DocumentReviewMustWinMissing } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, FolderOpen, ChevronDown, ChevronRight, ExternalLink,
  File, Link2,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  Requested:        "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Received:         "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Under Review":   "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Reviewed:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Missing:          "bg-rose-500/10 text-rose-400 border-rose-500/20",
  "Not Applicable": "bg-muted/50 text-muted-foreground border-border",
};

function fileStatusBadge(item: DocumentReviewItem) {
  if (item.storagePath) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <File size={9} /> File
      </span>
    );
  }
  if (item.url) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <Link2 size={9} /> Link
      </span>
    );
  }
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-muted/30 text-muted-foreground border border-border/40">
      No File
    </span>
  );
}

function DocRow({ item }: { item: DocumentReviewItem }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/targets/${item.targetId}`}>
            <span className="text-[11px] font-mono text-primary/70 hover:text-primary cursor-pointer font-semibold">
              {item.targetCode ?? `#${item.targetId}`}
            </span>
          </Link>
          <span className="text-[10px] font-mono text-muted-foreground">/</span>
          <span className="font-mono text-[12px] text-foreground">{item.title}</span>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80"
              title="Open external link"
            >
              <ExternalLink size={11} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge
            variant="outline"
            className={`text-[10px] font-mono px-1.5 py-0 rounded-sm border ${STATUS_COLORS[item.status] ?? "bg-muted/30 text-muted-foreground border-border"}`}
          >
            {item.status}
          </Badge>
          <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-sm border border-border/40">
            {item.documentType}
          </span>
          {fileStatusBadge(item)}
          {item.projectName && (
            <span className="text-[10px] font-mono text-muted-foreground">{item.projectName}</span>
          )}
          {item.currentStage && (
            <span className="text-[10px] font-mono text-muted-foreground">· {item.currentStage}</span>
          )}
          {item.owner && (
            <span className="text-[10px] font-mono text-muted-foreground">· {item.owner}</span>
          )}
          {item.documentDate && (
            <span className="text-[10px] font-mono text-muted-foreground">
              · {format(parseISO(item.documentDate), "d MMM yyyy")}
            </span>
          )}
        </div>
        {item.notes && (
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{item.notes}</p>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
  defaultOpen = true,
  accent,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="bg-card/40 border-border/70 rounded-xl">
      <CardHeader
        className="border-b border-border/60 pb-3 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono uppercase tracking-wider ${accent ?? "text-muted-foreground"}`}>
              {title}
            </span>
            <span className={`text-xs font-mono font-semibold ${count > 0 ? (accent ?? "text-foreground") : "text-muted-foreground"}`}>
              ({count})
            </span>
          </div>
          {open
            ? <ChevronDown size={14} className="text-muted-foreground" />
            : <ChevronRight size={14} className="text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="pt-0 px-4">
          {count === 0 ? (
            <div className="py-6 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
              None
            </div>
          ) : (
            children
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function DocumentReview() {
  const { data, isLoading } = useGetDocumentReview();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-widest text-primary/70">Review Cadence</p>
        <h1 className="text-2xl font-mono font-semibold uppercase tracking-tight">Document Review</h1>
        <p className="text-sm text-muted-foreground">
          Pipeline-wide document vault — missing, in-flight, and recently actioned.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : !data ? (
        <div className="py-20 text-center text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
          Could not load document review data
        </div>
      ) : (
        <div className="space-y-4">
          {data.mustWinMissing.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-400 shrink-0" />
                <span className="text-sm font-mono uppercase tracking-wider text-rose-400 font-semibold">
                  Must-Win Targets — Critical Docs Missing
                </span>
              </div>
              <div className="space-y-2">
                {data.mustWinMissing.map((t: DocumentReviewMustWinMissing) => (
                  <div key={t.targetId} className="flex items-start gap-3 flex-wrap">
                    <Link href={`/targets/${t.targetId}`}>
                      <span className="text-[11px] font-mono text-primary hover:text-primary/80 cursor-pointer font-semibold whitespace-nowrap">
                        {t.targetCode ?? `#${t.targetId}`}
                        {t.projectName ? ` — ${t.projectName}` : ""}
                      </span>
                    </Link>
                    <div className="flex flex-wrap gap-1">
                      {t.missingCriticalTypes.map((mt) => (
                        <span
                          key={mt}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        >
                          {mt}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.mustWinMissing.length === 0 &&
            data.requested.length === 0 &&
            data.underReview.length === 0 &&
            data.recentlyReceived.length === 0 &&
            data.recentlyReviewed.length === 0 && (
            <div className="py-20 text-center space-y-3">
              <FolderOpen size={32} className="mx-auto text-muted-foreground/30" />
              <div className="text-muted-foreground font-mono text-[11px] uppercase tracking-widest">
                No documents tracked across the pipeline yet
              </div>
              <p className="text-xs text-muted-foreground">
                Add documents from any deal's Documents tab to see them here.
              </p>
            </div>
          )}

          {(data.requested.length > 0 || data.mustWinMissing.length === 0) && (
            <Section
              title="Missing / Requested"
              count={data.requested.length}
              accent={data.requested.length > 0 ? "text-amber-400" : undefined}
            >
              {data.requested.map((item) => <DocRow key={item.id} item={item} />)}
            </Section>
          )}

          {(data.underReview.length > 0 || data.mustWinMissing.length === 0) && (
            <Section
              title="Under Review"
              count={data.underReview.length}
              accent={data.underReview.length > 0 ? "text-purple-400" : undefined}
            >
              {data.underReview.map((item) => <DocRow key={item.id} item={item} />)}
            </Section>
          )}

          <Section title="Recently Received" count={data.recentlyReceived.length} defaultOpen={false}>
            {data.recentlyReceived.map((item) => <DocRow key={item.id} item={item} />)}
          </Section>

          <Section title="Recently Reviewed" count={data.recentlyReviewed.length} defaultOpen={false}>
            {data.recentlyReviewed.map((item) => <DocRow key={item.id} item={item} />)}
          </Section>
        </div>
      )}
    </div>
  );
}
