import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Download } from "lucide-react";
import { downloadAuthenticatedFile } from "@/lib/download";

export const PIPELINE_EXPORT_COLUMNS = [
  { key: "targetCode",                   label: "Target Code",      group: "Identity" },
  { key: "projectName",                  label: "Project Name",     group: "Identity" },
  { key: "legalName",                    label: "Legal Name",       group: "Identity" },
  { key: "sector",                       label: "Sector",           group: "Identity" },
  { key: "country",                      label: "Country",          group: "Identity" },
  { key: "dealType",                     label: "Deal Type",        group: "Identity" },
  { key: "priorityTier",                 label: "Priority Tier",    group: "Status" },
  { key: "currentStage",                 label: "Current Stage",    group: "Status" },
  { key: "dealOwner",                    label: "Deal Owner",       group: "Status" },
  { key: "ndaStatus",                    label: "NDA Status",       group: "Status" },
  { key: "financialDdStatus",            label: "Financial DD",     group: "Status" },
  { key: "legalDdStatus",               label: "Legal DD",         group: "Status" },
  { key: "strategicFitScore",            label: "Strategic Fit",    group: "Scores" },
  { key: "financialAttractivenessScore", label: "Financial Score",  group: "Scores" },
  { key: "synergyScore",                 label: "Synergy Score",    group: "Scores" },
  { key: "createdAt",                    label: "Created Date",     group: "Dates" },
] as const;

type ColKey = (typeof PIPELINE_EXPORT_COLUMNS)[number]["key"];

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterParams: URLSearchParams;
}

const GROUPS = ["Identity", "Status", "Scores", "Dates"] as const;

export function ExportDialog({ open, onOpenChange, filterParams }: ExportDialogProps) {
  const [selected, setSelected] = useState<Set<ColKey>>(
    new Set(PIPELINE_EXPORT_COLUMNS.map((c) => c.key)),
  );
  const [downloading, setDownloading] = useState(false);

  function toggle(key: ColKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(PIPELINE_EXPORT_COLUMNS.map((c) => c.key)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function handleDownload() {
    if (selected.size === 0) return;
    const p = new URLSearchParams(filterParams);
    p.set("columns", [...selected].join(","));
    setDownloading(true);
    try {
      await downloadAuthenticatedFile(`/api/export/pipeline?${p.toString()}`, "pipeline-export.xlsx");
    } finally {
      setDownloading(false);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="font-sans font-semibold text-sm">Export Pipeline</DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground mb-3">
          Choose which columns to include in the Excel export.
        </div>

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={selectAll}
            className="text-[10px] font-mono uppercase tracking-wider text-primary underline underline-offset-2 hover:opacity-70"
          >
            Select all
          </button>
          <span className="text-muted-foreground text-[10px]">·</span>
          <button
            type="button"
            onClick={selectNone}
            className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground underline underline-offset-2 hover:opacity-70"
          >
            Clear all
          </button>
          <span className="ml-auto text-[10px] text-muted-foreground font-mono">
            {selected.size} / {PIPELINE_EXPORT_COLUMNS.length} columns
          </span>
        </div>

        <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
          {GROUPS.map((group) => {
            const cols = PIPELINE_EXPORT_COLUMNS.filter((c) => c.group === group);
            return (
              <div key={group}>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  {group}
                </div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                  {cols.map((col) => (
                    <div key={col.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`col-${col.key}`}
                        checked={selected.has(col.key)}
                        onCheckedChange={() => toggle(col.key)}
                      />
                      <Label
                        htmlFor={`col-${col.key}`}
                        className="text-xs cursor-pointer font-normal"
                      >
                        {col.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <Separator className="my-2" />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>

          <motion.div whileTap={{ scale: 0.96 }} style={{ display: "inline-flex" }}>
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={selected.size === 0 || downloading}
              className="gap-1.5"
            >
              <Download size={13} />
              {downloading ? "Exporting…" : `Download (${selected.size} cols)`}
            </Button>
          </motion.div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
