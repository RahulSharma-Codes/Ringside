import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GitBranch, Shield, CheckCircle2, AlertTriangle, FileText,
  ChevronDown, ChevronRight, Hash, RefreshCw, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { customFetch } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";

interface AuditEventRow {
  id: number;
  eventType: string;
  targetId: number | null;
  userIdentifier: string | null;
  occurredAt: string;
  payload: Record<string, unknown> | null;
  hashPrev: string | null;
  hashSelf: string | null;
}

interface VerifyResult {
  valid: boolean;
  checkedCount: number;
  firstBrokenAt: string | null;
}

// ── Event type display helpers ────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  deal_created:                 { label: "Deal Created",              icon: <FileText size={13} />,    color: "text-emerald-500" },
  deal_updated:                 { label: "Deal Updated",              icon: <FileText size={13} />,    color: "text-blue-400" },
  deal_dropped:                 { label: "Deal Dropped",              icon: <AlertTriangle size={13} />, color: "text-destructive" },
  stage_advanced:               { label: "Stage Advanced",            icon: <GitBranch size={13} />,   color: "text-primary" },
  stage_reverted:               { label: "Stage Reverted",            icon: <GitBranch size={13} />,   color: "text-amber-500" },
  ic_proposal_submitted:        { label: "IC Proposal Submitted",     icon: <Shield size={13} />,      color: "text-purple-400" },
  ic_vote_cast:                 { label: "IC Vote Cast",              icon: <Shield size={13} />,      color: "text-purple-400" },
  ic_decision_recorded:         { label: "IC Decision Recorded",      icon: <Shield size={13} />,      color: "text-purple-500" },
  ic_cp_satisfied:              { label: "IC Condition Satisfied",    icon: <CheckCircle2 size={13} />, color: "text-emerald-500" },
  gate_overridden:              { label: "Gate Override",             icon: <AlertTriangle size={13} />, color: "text-amber-500" },
  document_uploaded:            { label: "Document Uploaded",         icon: <FileText size={13} />,    color: "text-blue-400" },
  document_downloaded:          { label: "Document Downloaded",       icon: <FileText size={13} />,    color: "text-muted-foreground" },
  diligence_item_completed:     { label: "Diligence Item Completed",  icon: <CheckCircle2 size={13} />, color: "text-emerald-500" },
  action_created:               { label: "Action Created",            icon: <FileText size={13} />,    color: "text-muted-foreground" },
  action_completed:             { label: "Action Completed",          icon: <CheckCircle2 size={13} />, color: "text-emerald-500" },
  nda_recorded:                 { label: "NDA Recorded",              icon: <Shield size={13} />,      color: "text-blue-400" },
  regulatory_clearance_updated: { label: "Regulatory Clearance Updated", icon: <Shield size={13} />,  color: "text-blue-400" },
  valuation_recorded:           { label: "Valuation Recorded",        icon: <FileText size={13} />,    color: "text-emerald-400" },
  synergy_recorded:             { label: "Synergy Recorded",          icon: <FileText size={13} />,    color: "text-emerald-400" },
  login:                        { label: "User Login",                icon: <Shield size={13} />,      color: "text-muted-foreground" },
};

function getEventMeta(eventType: string) {
  return EVENT_META[eventType] ?? { label: eventType.replace(/_/g, " "), icon: <FileText size={13} />, color: "text-muted-foreground" };
}

const CHAINED_PREFIXES = ["stage_", "ic_"];
function isChained(eventType: string) {
  return CHAINED_PREFIXES.some((p) => eventType.startsWith(p));
}

// ── Subcomponent: single event row ────────────────────────────────────────────

function AuditEventRow({ event }: { event: AuditEventRow }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getEventMeta(event.eventType);
  const chained = isChained(event.eventType);
  const hasPayload = event.payload && Object.keys(event.payload).length > 0;

  return (
    <div className="border border-border/40 rounded-sm bg-card/40 overflow-hidden">
      <div
        className={`flex items-start gap-3 px-3 py-2.5 ${hasPayload || chained ? "cursor-pointer hover:bg-muted/20" : ""}`}
        onClick={() => (hasPayload || chained) && setExpanded((v) => !v)}
      >
        <div className={`mt-0.5 shrink-0 ${meta.color}`}>{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-mono font-semibold ${meta.color}`}>{meta.label}</span>
            {chained && event.hashSelf && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-muted-foreground/50 bg-muted/30 px-1.5 py-0.5 rounded-sm border border-border/30">
                <Hash size={8} />
                {event.hashSelf.slice(0, 12)}…
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {event.userIdentifier && (
              <span className="text-[10px] text-muted-foreground/70 font-mono">{event.userIdentifier}</span>
            )}
            <span className="text-[10px] text-muted-foreground/40 font-mono">
              {formatDistanceToNow(new Date(event.occurredAt), { addSuffix: true })}
            </span>
          </div>
        </div>
        {(hasPayload || chained) && (
          <div className="text-muted-foreground/40 shrink-0 mt-0.5">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border/30 pt-2 space-y-2">
          {event.payload && Object.keys(event.payload).length > 0 && (
            <div className="rounded-sm bg-background/60 border border-border/30 p-2">
              <pre className="text-[9px] font-mono text-muted-foreground/70 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          )}
          {chained && (
            <div className="space-y-1">
              {event.hashPrev && (
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground/40">
                  <Hash size={8} />
                  <span className="text-muted-foreground/30">prev:</span>
                  <span>{event.hashPrev}</span>
                </div>
              )}
              {event.hashSelf && (
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground/40">
                  <Hash size={8} />
                  <span className="text-muted-foreground/30">self:</span>
                  <span>{event.hashSelf}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main tab component ────────────────────────────────────────────────────────

export function AuditTrailTab({ targetId }: { targetId: number }) {
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const { data: events, isLoading, refetch } = useQuery<AuditEventRow[]>({
    queryKey: [`/api/audit/target/${targetId}`],
    queryFn: () => customFetch(`/api/audit/target/${targetId}`),
    enabled: !!targetId,
  });

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await customFetch<VerifyResult>(`/api/audit/verify/${targetId}`);
      setVerifyResult(result);
    } catch {
      setVerifyResult({ valid: false, checkedCount: 0, firstBrokenAt: null });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h3 className="font-sans text-sm font-semibold">Audit Trail</h3>
          <p className="text-[10px] text-muted-foreground/60 font-mono">Immutable event log — IC and stage events are hash-chained</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleVerify}
            disabled={verifying}
            className="rounded-sm font-mono text-[10px] uppercase h-7 px-2.5 gap-1.5"
          >
            {verifying ? <Loader2 size={10} className="animate-spin" /> : <Shield size={10} />}
            Verify Integrity
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            className="rounded-sm font-mono text-[10px] h-7 px-2 gap-1"
          >
            <RefreshCw size={10} />
          </Button>
        </div>
      </div>

      {/* Verify result banner */}
      {verifyResult && (
        <div className={`rounded-sm border px-3 py-2 flex items-center gap-2 text-[11px] font-mono ${
          verifyResult.valid
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
            : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}>
          {verifyResult.valid ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
          {verifyResult.valid
            ? `Chain intact — ${verifyResult.checkedCount} event${verifyResult.checkedCount !== 1 ? "s" : ""} verified`
            : `Chain broken — tamper detected${verifyResult.firstBrokenAt ? ` at ${new Date(verifyResult.firstBrokenAt).toLocaleString()}` : ""}`
          }
        </div>
      )}

      {/* Events list */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-sm" />
          ))}
        </div>
      )}

      {!isLoading && (!events || events.length === 0) && (
        <div className="text-center py-12 text-muted-foreground/40 font-mono text-[11px]">
          No audit events recorded yet
        </div>
      )}

      {!isLoading && events && events.length > 0 && (
        <div className="space-y-1.5">
          {events.map((evt) => (
            <AuditEventRow key={evt.id} event={evt} />
          ))}
        </div>
      )}
    </div>
  );
}
