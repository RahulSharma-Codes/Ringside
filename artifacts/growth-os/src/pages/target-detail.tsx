import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import {
  useGetTarget, getGetTargetQueryKey,
  useDeleteTarget,
  useGetStageHistory, getGetStageHistoryQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Target as TargetIcon, Plus, ShieldAlert, Edit, Trash2,
  MessageSquare, ListChecks, GitBranch,
  LayoutGrid, ClipboardCheck, FolderOpen, Sparkles, Loader2, Copy, Check, Bot,
  Activity as ActivityIcon, Scale, TrendingUp, AlertTriangle, Users,
  ShieldCheck, ClipboardList, Printer, ChevronDown, ChevronRight, ExternalLink,
} from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button as Btn } from "@/components/ui/button";
import { StageRail } from "@/components/stage-rail";
import { StageChip } from "@/components/stage-chip";
import { HealthDot } from "@/components/health-dot";
// Core tabs — always eagerly bundled (default tab + two most common)
import { OverviewTab } from "@/pages/target-detail-overview";
import { InteractionsTab } from "@/pages/target-detail-interactions";
import { ActionsTab } from "@/pages/target-detail-actions";
// Dialogs — always in the DOM, must be eager
import { StageChangeDialog } from "@/pages/target-detail-stage-dialog";
import { EditTargetDialog } from "@/pages/target-detail-edit-dialog";

// Secondary tabs — lazily fetched only when the user first clicks that tab
const HistoryTab     = React.lazy(() => import("@/pages/target-detail-history").then(m => ({ default: m.HistoryTab })));
const DiligenceTab   = React.lazy(() => import("@/pages/target-detail-diligence").then(m => ({ default: m.DiligenceTab })));
const DocumentsTab   = React.lazy(() => import("@/pages/target-detail-documents").then(m => ({ default: m.DocumentsTab })));
const ValuationTab   = React.lazy(() => import("@/pages/target-detail-valuation").then(m => ({ default: m.ValuationTab })));
const SynergiesTab   = React.lazy(() => import("@/pages/target-detail-synergies").then(m => ({ default: m.SynergiesTab })));
const ActivityTab    = React.lazy(() => import("@/pages/target-detail-activity").then(m => ({ default: m.ActivityTab })));
const IcTab          = React.lazy(() => import("@/pages/target-detail-ic").then(m => ({ default: m.IcTab })));
const StakeholdersTab = React.lazy(() => import("@/pages/target-detail-stakeholders").then(m => ({ default: m.StakeholdersTab })));
const ComplianceTab  = React.lazy(() => import("@/pages/target-detail-compliance").then(m => ({ default: m.ComplianceTab })));
const AuditTrailTab  = React.lazy(() => import("@/components/audit-trail-tab").then(m => ({ default: m.AuditTrailTab })));

/**
 * Renders a [Source: X] tag as a small inline grey badge.
 */
function SourceBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center ml-1 px-1.5 py-0 rounded text-[9px] font-mono bg-muted/80 text-muted-foreground/70 border border-border/50 align-middle whitespace-nowrap">
      {label}
    </span>
  );
}

/**
 * Renders a line of brief text, replacing [Source: X] tags with SourceBadge components.
 */
function BriefLine({ text }: { text: string }) {
  const parts = text.split(/(\[Source:[^\]]+\])/g);
  return (
    <span>
      {parts.map((part, i) => {
        const match = part.match(/^\[Source:(.+)\]$/);
        if (match) {
          return <SourceBadge key={i} label={`Source:${match[1]}`} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

const MISSING_DATA_HINTS: Record<string, string> = {
  "## 1. Teaser / IM Check": "No Teaser or IM attached — upload documents to unlock this section.",
  "## 2. Public Information Review": "No web search key configured — set BRAVE_SEARCH_API_KEY to enable public data.",
  "## 3. Tracxn Data": "",
  "## 4. Competitive Landscape": "",
  "## 5. Screening Result": "",
};

/**
 * Renders the AI brief as structured sections with source-tag inline badges.
 * Each `## N. Section` heading gets its own styled panel.
 */
function BriefSections({ content }: { content: string }) {
  const lines = content.split("\n");

  // Group lines into sections by markdown ## headings
  const sections: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  let preamble: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (current) sections.push(current);
      current = { heading: line, lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  const preambleText = preamble.join("\n").trim();

  const isSectionEmpty = (sLines: string[]) => {
    const joined = sLines.join(" ").toLowerCase();
    return (
      joined.includes("not available") ||
      joined.includes("no documents") ||
      joined.includes("no web") ||
      joined.includes("no public")
    );
  };

  return (
    <div className="space-y-3">
      {preambleText && (
        <p className="text-sm text-muted-foreground leading-relaxed">{preambleText}</p>
      )}
      {sections.map((section, si) => {
        const isEmpty = isSectionEmpty(section.lines);
        const missingHint = MISSING_DATA_HINTS[section.heading];
        return (
          <div key={si} className={`rounded-lg border p-3 space-y-2 ${isEmpty ? "border-border/30 bg-muted/20" : "border-border/50 bg-background/50"}`}>
            <h3 className="text-[12px] font-semibold text-foreground/80 font-sans">{section.heading.replace(/^## /, "")}</h3>
            {isEmpty && missingHint && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 flex items-start gap-1.5">
                <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                {missingHint}
              </p>
            )}
            <div className="text-[12px] leading-relaxed text-foreground/85 font-sans space-y-0.5">
              {section.lines.map((line, li) => {
                if (!line.trim()) return <div key={li} className="h-1" />;
                if (line.startsWith("- ") || line.startsWith("* ")) {
                  return (
                    <div key={li} className="flex gap-1.5 items-start">
                      <span className="text-muted-foreground/50 mt-0.5 shrink-0">•</span>
                      <BriefLine text={line.slice(2)} />
                    </div>
                  );
                }
                if (line.startsWith("**") && line.endsWith("**")) {
                  return (
                    <p key={li} className="font-semibold text-foreground/90">
                      <BriefLine text={line.replace(/\*\*/g, "")} />
                    </p>
                  );
                }
                return (
                  <p key={li}>
                    <BriefLine text={line} />
                  </p>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TargetDetail() {
  const { id } = useParams();
  const targetId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canEditDeal } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const [stageOpen, setStageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [interactionAddOpen, setInteractionAddOpen] = useState(false);
  const [actionAddOpen, setActionAddOpen] = useState(false);

  const [aiBriefOpen, setAiBriefOpen] = useState(false);
  const [briefContent, setBriefContent] = useState<string | null>(null);
  const [briefSearchResults, setBriefSearchResults] = useState<Array<{ title: string; url: string; snippet: string }>>([]);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefSetupRequired, setBriefSetupRequired] = useState(false);
  const [briefBillingRequired, setBriefBillingRequired] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);
  const [briefSourcesOpen, setBriefSourcesOpen] = useState(false);

  const { data: target, isLoading: loadingTarget } = useGetTarget(targetId, {
    query: { enabled: !!targetId, queryKey: getGetTargetQueryKey(targetId) },
  });
  const { data: history } = useGetStageHistory(targetId, {
    query: { enabled: !!targetId, queryKey: getGetStageHistoryQueryKey(targetId) },
  });

  const deleteTarget = useDeleteTarget();

  const invalidateTarget = () => queryClient.invalidateQueries({ queryKey: getGetTargetQueryKey(targetId) });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ai") === "opportunity-brief" && !isNaN(targetId)) {
      handleGenerateBrief();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateBrief = async () => {
    setBriefLoading(true);
    setBriefContent(null);
    setBriefSearchResults([]);
    setBriefSetupRequired(false);
    setBriefBillingRequired(false);
    setBriefSourcesOpen(false);
    setAiBriefOpen(true);
    try {
      const resp = await customFetch<{
        brief: string | null;
        searchResults?: Array<{ title: string; url: string; snippet: string }>;
        setupRequired?: boolean;
        billingRequired?: boolean;
        error?: string;
      }>("/api/ai/opportunity-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      if (resp.setupRequired) { setBriefSetupRequired(true); return; }
      if (resp.billingRequired) { setBriefBillingRequired(true); return; }
      setBriefContent(resp.brief ?? "No brief generated.");
      setBriefSearchResults(resp.searchResults ?? []);
    } catch {
      setBriefContent("Failed to generate brief. Please try again.");
    } finally {
      setBriefLoading(false);
    }
  };

  const handleDeleteTarget = () => {
    deleteTarget.mutate(
      { id: targetId },
      {
        onSuccess: () => { toast({ title: "Target Archived" }); setLocation("/pipeline"); },
        onError: () => toast({ title: "Error", description: "Could not archive target", variant: "destructive" }),
      },
    );
  };

  if (loadingTarget || !target) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-[200px]" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  const daysInCurrentStage = (() => {
    if (!history || history.length === 0) return undefined;
    const latestEntry = history[0];
    if (!latestEntry.changedAt) return undefined;
    try { return differenceInDays(new Date(), parseISO(latestEntry.changedAt)); }
    catch { return undefined; }
  })();

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">

      {/* Header — Row 1: nav + name + action buttons */}
      <div className="border-b border-border/60 bg-background/80 backdrop-blur-sm shrink-0">
        <div className="max-w-6xl mx-auto px-4 md:px-5 pt-4 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/pipeline">
                <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8 text-muted-foreground hover:text-foreground shrink-0">
                  <ArrowLeft size={16} />
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="text-lg md:text-2xl font-bold font-sans tracking-tight truncate leading-tight">
                  {target.projectName}
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <code className="text-[10px] font-mono text-muted-foreground/50 bg-muted/60 border border-border/40 px-1.5 py-0.5 rounded-md">
                    {target.targetCode}
                  </code>
                  {target.isConfidential && (
                    <Badge variant="outline" className="font-mono text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 h-4 px-1.5 rounded-md">
                      <ShieldAlert size={8} className="mr-1" />Confidential
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline"
                className="rounded-xl font-sans text-[11px] shrink-0 border-border/60 h-8 gap-1.5 hidden sm:flex"
                onClick={() => window.open(`/targets/${targetId}/ic-brief`, "_blank")}
              >
                <Printer size={11} className="text-muted-foreground" />
                IC Brief
              </Button>
              <Button size="sm" variant="outline"
                className="rounded-xl font-sans text-[11px] shrink-0 border-border/60 h-8 gap-1.5 hidden sm:flex"
                onClick={handleGenerateBrief} disabled={briefLoading}
              >
                {briefLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} className="text-primary" />}
                AI Brief
              </Button>
              {canEditDeal && (
                <Button size="sm" variant="outline" className="rounded-xl font-sans text-[11px] shrink-0 border-border/60 h-8 gap-1.5" onClick={() => setEditOpen(true)}>
                  <Edit size={11} />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
              {canEditDeal && (
                <Button size="sm" className="rounded-xl font-sans text-[11px] gap-1.5 h-8" onClick={() => setStageOpen(true)}>
                  <TargetIcon size={12} /> Stage
                </Button>
              )}
            </div>
          </div>

          {/* Row 2: premium stat strip — pills with clean dividers */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border/25">
            {target.currentStage && (
              <StageChip stage={target.currentStage} size="xs" />
            )}
            {target.priorityTier && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${
                target.priorityTier === "Must-Win"
                  ? "bg-destructive/10 text-destructive border-destructive/25"
                  : target.priorityTier === "Priority 1"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                  : target.priorityTier === "Priority 2"
                  ? "bg-primary/10 text-primary border-primary/25"
                  : "bg-muted/60 text-muted-foreground border-border/40"
              }`}>
                {target.priorityTier}
              </span>
            )}
            {(target as { healthScore?: string | null }).healthScore && (
              <HealthDot
                score={(target as { healthScore?: string | null }).healthScore as "healthy" | "watch" | "at_risk"}
                showLabel
                size="sm"
              />
            )}
            {daysInCurrentStage !== undefined && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-muted-foreground/60 bg-muted/40 border border-border/30">
                <TrendingUp size={8} />{daysInCurrentStage}d in stage
              </span>
            )}
            {target.sector && (
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono text-muted-foreground/60 bg-muted/40 border border-border/30">
                {target.sector}
              </span>
            )}
            {target.country && (
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono text-muted-foreground/60 bg-muted/40 border border-border/30">
                {target.country}
              </span>
            )}
            {(() => {
              const ownerUser = (target as any).dealOwnerUser as { id: string; displayName?: string | null; email: string } | null | undefined;
              const ownerName = ownerUser?.displayName || ownerUser?.email;
              if (!ownerName) return null;
              return (
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono text-muted-foreground/60 bg-muted/40 border border-border/30">
                  <span
                    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary/20 text-primary text-[7px] font-bold uppercase shrink-0"
                    title={ownerName}
                  >
                    {ownerName.slice(0, 2)}
                  </span>
                  {ownerName}
                </span>
              );
            })()}
            {(target as { diligencePct?: number | null }).diligencePct != null && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono text-muted-foreground/60 bg-muted/40 border border-border/30">
                <ClipboardList size={8} />
                <span>{(target as { diligencePct?: number | null }).diligencePct}% DD</span>
                <div className="w-10 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${(target as { diligencePct?: number | null }).diligencePct}%` }}
                  />
                </div>
              </span>
            )}
            {target.lastInteractionDate && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-muted-foreground/50 bg-muted/40 border border-border/30">
                <MessageSquare size={8} />
                {format(parseISO(target.lastInteractionDate), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stage Progression Rail */}
      <div className="border-b border-border/40 bg-background/60 px-4 md:px-5 py-3 shrink-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50">Pipeline Stage</span>
            {daysInCurrentStage !== undefined && (
              <span className="text-[9px] font-mono text-muted-foreground/40">· {daysInCurrentStage}d in current stage</span>
            )}
          </div>
          <StageRail mode="progression" currentStage={target.currentStage ?? "Sourcing"} daysInStage={daysInCurrentStage} dealType={target.dealType} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto bg-background pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-transparent border-b border-border w-full justify-start rounded-none p-0 h-auto mb-6 overflow-x-auto">
              {[
                { value: "overview",      label: "Overview",     icon: <LayoutGrid size={12} /> },
                { value: "interactions",  label: "Log",          icon: <MessageSquare size={12} /> },
                { value: "actions",       label: "Actions",      icon: <ListChecks size={12} /> },
                { value: "history",       label: "Timeline",     icon: <GitBranch size={12} /> },
                { value: "diligence",     label: "Diligence",    icon: <ClipboardCheck size={12} /> },
                { value: "documents",     label: "Documents",    icon: <FolderOpen size={12} /> },
                { value: "valuation",     label: "Valuation",    icon: <TrendingUp size={12} /> },
                { value: "synergies",     label: "Synergies",    icon: <Sparkles size={12} /> },
                { value: "activity",      label: "Activity",     icon: <ActivityIcon size={12} /> },
                { value: "ic",            label: "IC",           icon: <Scale size={12} /> },
                { value: "stakeholders",  label: "Stakeholders", icon: <Users size={12} /> },
                { value: "compliance",    label: "Compliance",   icon: <ShieldCheck size={12} /> },
                { value: "audit",         label: "Audit",        icon: <ClipboardList size={12} /> },
              ].map(({ value, label, icon }) => (
                <TabsTrigger key={value} value={value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 md:px-4 py-2.5 font-sans text-[12px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 text-muted-foreground data-[state=active]:text-foreground"
                >
                  {icon}{label}
                </TabsTrigger>
              ))}
            </TabsList>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <React.Suspense fallback={
                  <div className="py-10 flex justify-center">
                    <Loader2 size={18} className="animate-spin text-muted-foreground/30" />
                  </div>
                }>
                  <TabsContent value="overview" className="space-y-4 mt-0">
                    <OverviewTab targetId={targetId} target={target} />
                  </TabsContent>
                  <TabsContent value="interactions" className="space-y-4 mt-0">
                    <InteractionsTab targetId={targetId} addOpen={interactionAddOpen} onAddOpenChange={setInteractionAddOpen} />
                  </TabsContent>
                  <TabsContent value="actions" className="space-y-4 mt-0">
                    <ActionsTab targetId={targetId} addOpen={actionAddOpen} onAddOpenChange={setActionAddOpen} />
                  </TabsContent>
                  <TabsContent value="history" className="mt-0"><HistoryTab targetId={targetId} /></TabsContent>
                  <TabsContent value="ic" className="mt-0"><IcTab targetId={targetId} dealName={target.projectName ?? target.targetCode ?? undefined} /></TabsContent>
                  <TabsContent value="stakeholders" className="mt-0"><StakeholdersTab targetId={targetId} /></TabsContent>
                  <TabsContent value="compliance" className="mt-0"><ComplianceTab targetId={targetId} /></TabsContent>
                  <TabsContent value="audit" className="mt-0"><AuditTrailTab targetId={targetId} /></TabsContent>
                  <TabsContent value="diligence" className="space-y-4 mt-0"><DiligenceTab targetId={targetId} /></TabsContent>
                  <TabsContent value="documents" className="space-y-4 mt-0"><DocumentsTab targetId={targetId} /></TabsContent>
                  <TabsContent value="valuation" className="mt-0">
                    <ValuationTab targetId={targetId} currentStage={target.currentStage ?? undefined} />
                  </TabsContent>
                  <TabsContent value="synergies" className="mt-0">
                    <SynergiesTab targetId={targetId} currentStage={target.currentStage ?? "Sourcing"} />
                  </TabsContent>
                  <TabsContent value="activity" className="mt-0">
                    <ActivityTab targetId={targetId} isActive={activeTab === "activity"} />
                  </TabsContent>
                </React.Suspense>
              </motion.div>
            </AnimatePresence>
          </Tabs>
        </div>
      </div>

      {/* Mobile sticky bottom bar — pb accounts for iOS/Android home gesture bar */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar/95 backdrop-blur-sm px-3 pt-3 flex gap-2"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <Button variant="outline" size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase border-border"
          onClick={() => { setActiveTab("interactions"); setInteractionAddOpen(true); }}>
          <MessageSquare size={13} className="mr-1" /> Log
        </Button>
        <Button variant="outline" size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase border-border"
          onClick={() => { setActiveTab("actions"); setActionAddOpen(true); }}>
          <Plus size={13} className="mr-1" /> Add Action
        </Button>
        {canEditDeal && (
          <Button size="sm" className="flex-1 rounded-sm font-mono text-[10px] uppercase" onClick={() => setStageOpen(true)}>
            <TargetIcon size={13} className="mr-1" /> Change Stage
          </Button>
        )}
      </div>

      {/* ══ DIALOGS ══ */}

      <StageChangeDialog
        open={stageOpen}
        onOpenChange={setStageOpen}
        targetId={targetId}
        target={target}
        onSuccess={invalidateTarget}
      />

      <EditTargetDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        targetId={targetId}
        target={target}
        onSuccess={invalidateTarget}
      />

      {/* Delete/Archive Target */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[425px] border-destructive bg-sidebar rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-sans font-semibold text-lg text-destructive">Archive Deal</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will archive <span className="font-medium text-foreground">{target.projectName}</span> and remove it from the active pipeline.
            </p>
          </div>
          <DialogFooter>
            <Btn variant="outline" onClick={() => setDeleteOpen(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Btn>
            <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
              <Btn variant="destructive" onClick={handleDeleteTarget} disabled={deleteTarget.isPending} className="rounded-sm font-mono uppercase text-[10px]">Archive</Btn>
            </motion.div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Opportunity Brief */}
      <Dialog open={aiBriefOpen} onOpenChange={(open) => { setAiBriefOpen(open); if (!open) { setBriefContent(null); setBriefSearchResults([]); } }}>
        <DialogContent className="sm:max-w-[720px] border-border bg-sidebar rounded-sm max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Bot size={13} className="text-primary" />
              </div>
              <DialogTitle className="font-sans font-semibold text-base">AI Opportunity Brief</DialogTitle>
              {briefContent && (
                <span className="text-[10px] font-mono text-muted-foreground/60 bg-muted/60 border border-border/50 px-2 py-0.5 rounded-md ml-auto">
                  {target.projectName}
                </span>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 min-h-0 space-y-4">
            {briefLoading && (
              <div className="flex flex-col items-center justify-center gap-4 py-12">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Loader2 size={18} className="text-primary animate-spin" />
                </div>
                <p className="text-sm text-muted-foreground">Generating AI brief…</p>
                <p className="text-xs text-muted-foreground/60">Running web searches and analysing documents</p>
              </div>
            )}
            {!briefLoading && briefSetupRequired && (
              <div className="text-center py-10 space-y-2">
                <p className="text-sm font-semibold">AI Not Configured</p>
                <p className="text-sm text-muted-foreground">Add an OPENAI_API_KEY secret to enable AI briefs.</p>
              </div>
            )}
            {!briefLoading && briefBillingRequired && (
              <div className="text-center py-10 space-y-2">
                <Sparkles size={24} className="text-amber-500 mx-auto" />
                <p className="text-sm font-semibold text-amber-500">AI Credits Needed</p>
                <p className="text-sm text-muted-foreground">Add OpenAI API credits to activate AI workflows.</p>
              </div>
            )}
            {!briefLoading && briefContent && !briefSetupRequired && !briefBillingRequired && (
              <>
                <BriefSections content={briefContent} />
                {/* Sources used collapsible */}
                {briefSearchResults.length > 0 && (
                  <div className="border border-border/40 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-mono text-muted-foreground hover:bg-muted/40 transition-colors"
                      onClick={() => setBriefSourcesOpen((v) => !v)}
                    >
                      <span className="flex items-center gap-1.5">
                        <ExternalLink size={10} />
                        Web sources used ({briefSearchResults.length})
                      </span>
                      {briefSourcesOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </button>
                    {briefSourcesOpen && (
                      <div className="border-t border-border/40 divide-y divide-border/30">
                        {briefSearchResults.map((r, i) => (
                          <div key={i} className="px-3 py-2 space-y-0.5">
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1"
                            >
                              {r.title || r.url}
                              <ExternalLink size={9} className="shrink-0 opacity-60" />
                            </a>
                            <p className="text-[10px] text-muted-foreground/70 line-clamp-2">{r.snippet}</p>
                            <p className="text-[9px] font-mono text-muted-foreground/40">{r.url}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t border-border/60 pt-3 mt-0">
            {briefContent && !briefSetupRequired && !briefBillingRequired && (
              <Btn variant="outline" size="sm"
                onClick={() => { navigator.clipboard.writeText(briefContent ?? "").catch(() => {}); setBriefCopied(true); setTimeout(() => setBriefCopied(false), 2000); }}
                className="rounded-sm font-mono text-[10px] uppercase gap-1"
              >
                {briefCopied ? <Check size={11} /> : <Copy size={11} />}
                {briefCopied ? "Copied" : "Copy Brief"}
              </Btn>
            )}
            <Btn variant="outline" size="sm" onClick={handleGenerateBrief} disabled={briefLoading} className="rounded-sm font-mono text-[10px] uppercase gap-1">
              <Sparkles size={11} /> Regenerate
            </Btn>
            <Btn size="sm" onClick={() => setAiBriefOpen(false)} className="rounded-sm font-mono text-[10px] uppercase">Close</Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
