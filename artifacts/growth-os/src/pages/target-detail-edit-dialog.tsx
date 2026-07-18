import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useUpdateTarget, getGetTargetQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const PRIORITY_TIERS = ["Must-Win", "Priority 1", "Priority 2", "Watchlist"];
const DEAL_TYPES = ["Acquisition", "Minority Investment", "Divestiture", "JV", "Partnership", "Strategic Alliance", "Other"];
const EARLY_STAGES = new Set(["Sourcing", "Outreach", "Introductory Discussion", "NDA / CIM"]);

type EditTargetData = {
  projectName: string; priorityTier: string; dealType: string; strategicRationale: string;
  sector: string; subsector: string; geographyRegion: string; country: string;
  dealOwner: string; dealChampion: string; executiveSponsor: string;
  strategicFitScore: number; synergyScore: number; financialAttractivenessScore: number;
  processMaturityScore: number; riskPenaltyScore: number;
};

interface TargetLike {
  projectName?: string | null; priorityTier?: string | null; dealType?: string | null;
  strategicRationale?: string | null; sector?: string | null; subsector?: string | null;
  geographyRegion?: string | null; country?: string | null; dealOwner?: string | null;
  dealChampion?: string | null; executiveSponsor?: string | null;
  strategicFitScore?: number | null; synergyScore?: number | null;
  financialAttractivenessScore?: number | null; processMaturityScore?: number | null;
  riskPenaltyScore?: number | null; currentStage?: string | null;
}

interface EditTargetDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetId: number;
  target: TargetLike;
  onSuccess?: () => void;
}

export function EditTargetDialog({ open, onOpenChange, targetId, target, onSuccess }: EditTargetDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateTarget = useUpdateTarget();
  const [dealTypeWarning, setDealTypeWarning] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditTargetData>({
    projectName: "", priorityTier: "", dealType: "", strategicRationale: "",
    sector: "", subsector: "", geographyRegion: "", country: "",
    dealOwner: "", dealChampion: "", executiveSponsor: "",
    strategicFitScore: 50, synergyScore: 50, financialAttractivenessScore: 50,
    processMaturityScore: 50, riskPenaltyScore: 0,
  });

  useEffect(() => {
    if (target && open) {
      setEditData({
        projectName: target.projectName ?? "",
        priorityTier: target.priorityTier ?? "",
        dealType: target.dealType ?? "",
        strategicRationale: target.strategicRationale ?? "",
        sector: target.sector ?? "",
        subsector: target.subsector ?? "",
        geographyRegion: target.geographyRegion ?? "",
        country: target.country ?? "",
        dealOwner: target.dealOwner ?? "",
        dealChampion: target.dealChampion ?? "",
        executiveSponsor: target.executiveSponsor ?? "",
        strategicFitScore: target.strategicFitScore ?? 50,
        synergyScore: target.synergyScore ?? 50,
        financialAttractivenessScore: target.financialAttractivenessScore ?? 50,
        processMaturityScore: target.processMaturityScore ?? 50,
        riskPenaltyScore: target.riskPenaltyScore ?? 0,
      });
      setDealTypeWarning(null);
    }
  }, [target, open]);

  function handleUpdateTarget() {
    updateTarget.mutate(
      {
        id: targetId,
        data: {
          projectName: editData.projectName || undefined,
          priorityTier: editData.priorityTier || undefined,
          dealType: editData.dealType || null,
          strategicRationale: editData.strategicRationale || undefined,
          sector: editData.sector || undefined,
          subsector: editData.subsector || undefined,
          geographyRegion: editData.geographyRegion || undefined,
          country: editData.country || undefined,
          dealOwner: editData.dealOwner || undefined,
          dealChampion: editData.dealChampion || undefined,
          executiveSponsor: editData.executiveSponsor || undefined,
          strategicFitScore: editData.strategicFitScore,
          synergyScore: editData.synergyScore,
          financialAttractivenessScore: editData.financialAttractivenessScore,
          processMaturityScore: editData.processMaturityScore,
          riskPenaltyScore: editData.riskPenaltyScore,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Target Updated" });
          onOpenChange(false);
          queryClient.invalidateQueries({ queryKey: getGetTargetQueryKey(targetId) });
          onSuccess?.();
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          if (msg?.includes("Deal type can only be changed")) {
            setDealTypeWarning(msg);
          } else {
            toast({ title: "Error", description: "Could not update target", variant: "destructive" });
          }
        },
      },
    );
  }

  const isEarlyStage = EARLY_STAGES.has(target.currentStage ?? "Sourcing");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] border-border bg-sidebar rounded-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-sans font-semibold text-lg">Edit Deal</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-5">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1">Basic Info</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Project Name</label>
                <Input value={editData.projectName} onChange={(e) => setEditData((d) => ({ ...d, projectName: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Priority Tier</label>
                <Select value={editData.priorityTier} onValueChange={(v) => setEditData((d) => ({ ...d, priorityTier: v }))}>
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-sm">{PRIORITY_TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Deal Type</label>
                <Select
                  disabled={!isEarlyStage}
                  value={editData.dealType || "__none__"}
                  onValueChange={(v) => { setDealTypeWarning(null); setEditData((d) => ({ ...d, dealType: v === "__none__" ? "" : v })); }}
                >
                  <SelectTrigger className="rounded-sm bg-background/50"><SelectValue placeholder="Select deal type…" /></SelectTrigger>
                  <SelectContent className="rounded-sm">
                    <SelectItem value="__none__">— None —</SelectItem>
                    {DEAL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                {dealTypeWarning && <p className="text-[10px] text-amber-500 font-mono">{dealTypeWarning}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sector</label>
                <Input value={editData.sector} onChange={(e) => setEditData((d) => ({ ...d, sector: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Subsector</label>
                <Input value={editData.subsector} onChange={(e) => setEditData((d) => ({ ...d, subsector: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Country</label>
                <Input value={editData.country} onChange={(e) => setEditData((d) => ({ ...d, country: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Geography Region</label>
                <Input value={editData.geographyRegion} onChange={(e) => setEditData((d) => ({ ...d, geographyRegion: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1">Team</div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Deal Owner</label>
                <Input value={editData.dealOwner} onChange={(e) => setEditData((d) => ({ ...d, dealOwner: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Deal Champion</label>
                <Input value={editData.dealChampion} onChange={(e) => setEditData((d) => ({ ...d, dealChampion: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Exec Sponsor</label>
                <Input value={editData.executiveSponsor} onChange={(e) => setEditData((d) => ({ ...d, executiveSponsor: e.target.value }))} className="rounded-sm bg-background/50" />
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3 border-b border-border pb-1">Scores (0–100)</div>
            <div className="grid grid-cols-2 gap-4">
              {([
                { label: "Strategic Fit", key: "strategicFitScore" as const },
                { label: "Synergy Potential", key: "synergyScore" as const },
                { label: "Financial Attractiveness", key: "financialAttractivenessScore" as const },
                { label: "Process Maturity", key: "processMaturityScore" as const },
                { label: "Risk Penalty", key: "riskPenaltyScore" as const },
              ]).map(({ label, key }) => (
                <div key={key} className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</label>
                  <Input
                    type="number" min={0} max={100}
                    value={editData[key]}
                    onChange={(e) => setEditData((d) => ({ ...d, [key]: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                    className="rounded-sm bg-background/50"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Strategic Rationale</label>
            <Textarea value={editData.strategicRationale} onChange={(e) => setEditData((d) => ({ ...d, strategicRationale: e.target.value }))} className="rounded-sm bg-background/50 resize-none h-24" placeholder="Why is this target strategically valuable?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-sm font-mono uppercase text-[10px]">Cancel</Button>
          <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
            <Button onClick={handleUpdateTarget} disabled={updateTarget.isPending} className="rounded-sm font-mono uppercase text-[10px]">Save Changes</Button>
          </motion.div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
