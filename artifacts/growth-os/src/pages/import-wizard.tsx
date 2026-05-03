import React, { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import type { Row } from "read-excel-file/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, FileText, CheckCircle, AlertTriangle, XCircle,
  ChevronRight, ChevronLeft, RotateCcw, Info,
} from "lucide-react";
import { getListTargetsQueryKey, getGetDashboardSummaryQueryKey, customFetch } from "@workspace/api-client-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_FIELDS = [
  { value: "__skip__", label: "— Skip this column —" },
  { value: "targetCode", label: "Target Code" },
  { value: "projectName", label: "Project Name" },
  { value: "legalName", label: "Legal Name" },
  { value: "businessUnit", label: "Business Unit" },
  { value: "sector", label: "Sector" },
  { value: "subsector", label: "Subsector" },
  { value: "geographyRegion", label: "Geography Region" },
  { value: "country", label: "Country" },
  { value: "sourcingChannel", label: "Sourcing Channel" },
  { value: "sourcingFirm", label: "Sourcing Firm" },
  { value: "dealOwner", label: "Deal Owner" },
  { value: "dealChampion", label: "Deal Champion" },
  { value: "executiveSponsor", label: "Executive Sponsor" },
  { value: "priorityTier", label: "Priority Tier" },
  { value: "stage", label: "Stage" },
  { value: "strategicRationale", label: "Strategic Rationale" },
  { value: "notes", label: "Notes → Strategic Rationale" },
  { value: "strategicFitScore", label: "Strategic Fit Score (0-100)" },
  { value: "synergyScore", label: "Synergy Score (0-100)" },
  { value: "financialAttractivenessScore", label: "Financial Attractiveness Score (0-100)" },
  { value: "processMaturityScore", label: "Process Maturity Score (0-100)" },
  { value: "riskPenaltyScore", label: "Risk Penalty Score (0-100)" },
];

// Heuristic auto-map: csv column header → db field
function autoMap(header: string): string {
  const h = header.toLowerCase().replace(/[\s_\-/]+/g, "");
  const MAP: Record<string, string> = {
    targetcode: "targetCode",
    code: "targetCode",
    projectname: "projectName",
    project: "projectName",
    name: "projectName",
    legalname: "legalName",
    legal: "legalName",
    businessunit: "businessUnit",
    bu: "businessUnit",
    division: "businessUnit",
    sector: "sector",
    industry: "sector",
    subsector: "subsector",
    subindustry: "subsector",
    region: "geographyRegion",
    geographyregion: "geographyRegion",
    geography: "geographyRegion",
    country: "country",
    location: "country",
    sourcingchannel: "sourcingChannel",
    channel: "sourcingChannel",
    sourcingfirm: "sourcingFirm",
    firm: "sourcingFirm",
    dealowner: "dealOwner",
    owner: "dealOwner",
    dealchampion: "dealChampion",
    champion: "dealChampion",
    executivesponsor: "executiveSponsor",
    sponsor: "executiveSponsor",
    prioritytier: "priorityTier",
    priority: "priorityTier",
    tier: "priorityTier",
    stage: "stage",
    pipelinestage: "stage",
    strategicrationale: "strategicRationale",
    rationale: "strategicRationale",
    notes: "notes",
    note: "notes",
    strategicfitscore: "strategicFitScore",
    fitscores: "strategicFitScore",
    strategicfit: "strategicFitScore",
    synergyscore: "synergyScore",
    synergy: "synergyScore",
    financialattractivenesscore: "financialAttractivenessScore",
    financialscore: "financialAttractivenessScore",
    financialattractiveness: "financialAttractivenessScore",
    processmaturityscore: "processMaturityScore",
    processscore: "processMaturityScore",
    processmaturity: "processMaturityScore",
    riskpenaltyscore: "riskPenaltyScore",
    riskscore: "riskPenaltyScore",
    risk: "riskPenaltyScore",
  };
  return MAP[h] ?? "__skip__";
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ParsedRow = { rowIndex: number; data: Record<string, unknown> };

type RowClassified = {
  rowIndex: number;
  data: Record<string, unknown>;
  existingId?: number;
  changedFields?: string[];
  newStage?: string;
};

type RowSkipped = { rowIndex: number; targetCode?: string; reason: string };

type ValidateResult = {
  toCreate: RowClassified[];
  toUpdate: RowClassified[];
  toSkip: RowSkipped[];
  warnings: string[];
};

type ApplyResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { rowIndex: number; message: string }[];
};

type WizardStep = "upload" | "map" | "preview" | "apply" | "done";

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map Columns" },
    { key: "preview", label: "Preview" },
    { key: "apply", label: "Apply" },
    { key: "done", label: "Done" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className={`flex items-center gap-1.5 ${i <= idx ? "text-foreground" : "text-muted-foreground"}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono border ${
              i < idx ? "bg-primary border-primary text-primary-foreground" :
              i === idx ? "border-primary text-primary" :
              "border-muted-foreground"
            }`}>{i < idx ? <CheckCircle size={10} /> : i + 1}</div>
            <span className="text-[10px] font-mono uppercase tracking-wider hidden sm:block">{s.label}</span>
          </div>
          {i < steps.length - 1 && <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

export default function ImportWizard() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File parsing ────────────────────────────────────────────────────────────

  const parseFile = useCallback(async (file: File) => {
    setParseError(null);
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (ext === "csv" || ext === "txt") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          if (result.errors.length > 0 && result.data.length === 0) {
            setParseError("Failed to parse CSV: " + result.errors[0].message);
            return;
          }
          const hdrs = result.meta.fields ?? [];
          const parsed: ParsedRow[] = (result.data as Record<string, unknown>[]).map((row, i) => ({
            rowIndex: i + 2,
            data: row,
          }));
          setHeaders(hdrs);
          setRows(parsed);
          const initialMap: Record<string, string> = {};
          for (const h of hdrs) initialMap[h] = autoMap(h);
          setColumnMap(initialMap);
          setStep("map");
        },
        error: (err) => setParseError("CSV parse error: " + err.message),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      try {
        const rawRows: Row[] = await readSheet(file);
        if (!rawRows || rawRows.length < 2) {
          setParseError("Excel file appears empty or has no data rows.");
          return;
        }
        const hdrs = (rawRows[0] ?? []).map((c: Row[number]) => String(c ?? ""));
        const dataRows: ParsedRow[] = rawRows.slice(1).map((row: Row, i: number) => {
          const obj: Record<string, unknown> = {};
          hdrs.forEach((h: string, j: number) => { obj[h] = row[j] ?? ""; });
          return { rowIndex: i + 2, data: obj };
        });
        setHeaders(hdrs);
        setRows(dataRows);
        const initialMap: Record<string, string> = {};
        for (const h of hdrs) initialMap[h] = autoMap(h);
        setColumnMap(initialMap);
        setStep("map");
      } catch (err) {
        setParseError("Failed to parse Excel file: " + (err instanceof Error ? err.message : String(err)));
      }
    } else {
      setParseError("Unsupported file type. Please upload a .csv, .xlsx, or .xls file.");
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  // ── Validate ────────────────────────────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setApiError(null);
    try {
      const result = await customFetch<ValidateResult>("/api/import/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, columnMap }),
      });
      setValidateResult(result);
      setStep("preview");
    } catch (err) {
      setApiError("Validation failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsValidating(false);
    }
  }, [rows, columnMap]);

  // ── Apply ────────────────────────────────────────────────────────────────────

  const handleApply = useCallback(async () => {
    if (!validateResult) return;
    setIsApplying(true);
    setApiError(null);
    try {
      const result = await customFetch<ApplyResult>("/api/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toCreate: validateResult.toCreate.map(({ rowIndex, data }) => ({ rowIndex, data })),
          toUpdate: validateResult.toUpdate.map(({ rowIndex, existingId, data, changedFields, newStage }) => ({
            rowIndex, existingId, data, changedFields: changedFields ?? [], newStage,
          })),
          changedBy: "Import Wizard",
        }),
      });
      setApplyResult(result);
      setStep("done");
      // Invalidate queries to refresh pipeline + dashboard
      await queryClient.invalidateQueries({ queryKey: getListTargetsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    } catch (err) {
      setApiError("Apply failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsApplying(false);
    }
  }, [validateResult, queryClient]);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setColumnMap({});
    setParseError(null);
    setValidateResult(null);
    setApplyResult(null);
    setApiError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-8 space-y-5 animate-in fade-in duration-500 pb-20 md:pb-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Import Targets</h1>
        <p className="text-sm text-muted-foreground">Bulk add or update deal targets via CSV or Excel</p>
      </div>

      <StepIndicator step={step} />

      {/* ── Step: Upload ─────────────────────────────────────────────────── */}
      {step === "upload" && (
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Upload File</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-sm p-10 text-center transition-colors cursor-pointer ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto mb-3 text-muted-foreground" size={32} />
              <p className="text-sm font-mono text-muted-foreground">
                Drag & drop a <span className="text-foreground">.csv</span>,{" "}
                <span className="text-foreground">.xlsx</span>, or{" "}
                <span className="text-foreground">.xls</span> file here
              </p>
              <p className="text-xs font-mono text-muted-foreground mt-1">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {parseError && (
              <Alert className="border-destructive/50 bg-destructive/10 rounded-sm">
                <XCircle size={14} className="text-destructive" />
                <AlertDescription className="text-destructive font-mono text-xs">{parseError}</AlertDescription>
              </Alert>
            )}

            {/* Format guide */}
            <div className="bg-muted/30 rounded-sm p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Info size={12} className="text-muted-foreground" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Format Guide</span>
              </div>
              <ul className="space-y-1 text-xs font-mono text-muted-foreground list-disc list-inside">
                <li>First row must be column headers</li>
                <li>Rows with an existing <strong>Target Code</strong> will be updated</li>
                <li>Rows with a new code (+ project name) will be created</li>
                <li>Blank cells in the file will never overwrite existing data</li>
                <li>You will map column headers to fields in the next step</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step: Map Columns ─────────────────────────────────────────────── */}
      {step === "map" && (
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center justify-between">
              <span>Map Columns</span>
              <span className="text-muted-foreground font-normal text-xs">{fileName} · {rows.length} rows</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs font-mono text-muted-foreground">
              Assign each spreadsheet column to a field. Columns set to "Skip" will be ignored.
            </p>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {headers.map((header) => {
                const sampleVal = rows.slice(0, 3).map((r) => r.data[header]).filter(Boolean).join(", ");
                return (
                  <div key={header} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-medium truncate">{header}</div>
                      {sampleVal && (
                        <div className="text-[10px] font-mono text-muted-foreground truncate">{sampleVal}</div>
                      )}
                    </div>
                    <ChevronRight size={12} className="text-muted-foreground shrink-0" />
                    <Select
                      value={columnMap[header] ?? "__skip__"}
                      onValueChange={(val) => setColumnMap((prev) => ({ ...prev, [header]: val }))}
                    >
                      <SelectTrigger className="rounded-sm font-mono text-[11px] border-border bg-background/50 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-sm font-mono text-[11px] max-h-60">
                        {DB_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            {apiError && (
              <Alert className="border-destructive/50 bg-destructive/10 rounded-sm">
                <AlertDescription className="text-destructive font-mono text-xs">{apiError}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="rounded-sm font-mono text-[10px] uppercase" onClick={reset}>
                <ChevronLeft size={12} className="mr-1" /> Back
              </Button>
              <Button
                size="sm"
                className="rounded-sm font-mono text-[10px] uppercase"
                onClick={handleValidate}
                disabled={isValidating}
              >
                {isValidating ? "Validating…" : "Preview Changes"}
                {!isValidating && <ChevronRight size={12} className="ml-1" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step: Preview ─────────────────────────────────────────────────── */}
      {step === "preview" && validateResult && (
        <div className="space-y-4">
          {/* Summary banner */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold font-mono text-green-500">{validateResult.toCreate.length}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mt-1">To Create</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold font-mono text-primary">{validateResult.toUpdate.length}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mt-1">To Update</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold font-mono text-muted-foreground">{validateResult.toSkip.length}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mt-1">Skipped</div>
              </CardContent>
            </Card>
          </div>

          {/* Warnings */}
          {validateResult.warnings.length > 0 && (
            <Alert className="border-amber-500/30 bg-amber-500/10 rounded-sm">
              <AlertTriangle size={14} className="text-amber-500" />
              <AlertDescription className="space-y-1">
                {validateResult.warnings.map((w, i) => (
                  <p key={i} className="text-xs font-mono text-amber-700 dark:text-amber-300">{w}</p>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {/* To Create */}
          {validateResult.toCreate.length > 0 && (
            <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                  <Badge className="bg-green-500/20 text-green-600 dark:text-green-400 border-0 font-mono text-[9px]">New</Badge>
                  {validateResult.toCreate.length} target{validateResult.toCreate.length !== 1 ? "s" : ""} to create
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {validateResult.toCreate.map((row) => (
                    <div key={row.rowIndex} className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-muted-foreground w-12 shrink-0">Row {row.rowIndex}</span>
                      <span className="font-medium">{String(row.data.projectName ?? "—")}</span>
                      <span className="text-muted-foreground">{String(row.data.targetCode ?? "")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* To Update */}
          {validateResult.toUpdate.length > 0 && (
            <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                  <Badge className="bg-primary/20 text-primary border-0 font-mono text-[9px]">Update</Badge>
                  {validateResult.toUpdate.length} target{validateResult.toUpdate.length !== 1 ? "s" : ""} to update
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {validateResult.toUpdate.map((row) => (
                    <div key={row.rowIndex} className="text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-12 shrink-0">Row {row.rowIndex}</span>
                        <span className="font-medium">{String(row.data.targetCode ?? "—")}</span>
                      </div>
                      <div className="ml-14 flex flex-wrap gap-1 mt-0.5">
                        {(row.changedFields ?? []).map((f) => (
                          <Badge key={f} variant="outline" className="font-mono text-[9px] rounded-sm border-border">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Skipped */}
          {validateResult.toSkip.length > 0 && (
            <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[9px] rounded-sm border-muted-foreground text-muted-foreground">
                    Skipped
                  </Badge>
                  {validateResult.toSkip.length} row{validateResult.toSkip.length !== 1 ? "s" : ""} skipped
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {validateResult.toSkip.map((row) => (
                    <div key={row.rowIndex} className="text-xs font-mono text-muted-foreground">
                      <span className="w-12 inline-block shrink-0">Row {row.rowIndex}</span>
                      <span className="text-destructive/80">{row.reason}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {apiError && (
            <Alert className="border-destructive/50 bg-destructive/10 rounded-sm">
              <AlertDescription className="text-destructive font-mono text-xs">{apiError}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-sm font-mono text-[10px] uppercase" onClick={() => setStep("map")}>
              <ChevronLeft size={12} className="mr-1" /> Back
            </Button>
            <Button
              size="sm"
              className="rounded-sm font-mono text-[10px] uppercase"
              onClick={handleApply}
              disabled={isApplying || (validateResult.toCreate.length === 0 && validateResult.toUpdate.length === 0)}
            >
              {isApplying ? "Applying…" : `Apply ${validateResult.toCreate.length + validateResult.toUpdate.length} Changes`}
              {!isApplying && <ChevronRight size={12} className="ml-1" />}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Apply (loading) ─────────────────────────────────────────── */}
      {step === "apply" && (
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardContent className="p-10 text-center space-y-4">
            <div className="font-mono text-sm uppercase tracking-wider text-muted-foreground">Applying import…</div>
            <Progress className="w-full rounded-sm" value={undefined} />
          </CardContent>
        </Card>
      )}

      {/* ── Step: Done ────────────────────────────────────────────────────── */}
      {step === "done" && applyResult && (
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardContent className="p-8 space-y-6">
            <div className="text-center">
              <CheckCircle className="mx-auto mb-3 text-green-500" size={40} />
              <h2 className="font-mono text-lg uppercase tracking-tight font-bold">Import Complete</h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-green-500">{applyResult.created}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-primary">{applyResult.updated}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">Updated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-muted-foreground">{applyResult.skipped}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">Skipped</div>
              </div>
            </div>

            {applyResult.errors.length > 0 && (
              <Alert className="border-destructive/50 bg-destructive/10 rounded-sm">
                <AlertTriangle size={14} className="text-destructive" />
                <AlertDescription className="space-y-1">
                  <p className="text-xs font-mono font-medium text-destructive">
                    {applyResult.errors.length} row{applyResult.errors.length !== 1 ? "s" : ""} failed:
                  </p>
                  {applyResult.errors.map((e) => (
                    <p key={e.rowIndex} className="text-xs font-mono text-destructive/80">
                      Row {e.rowIndex}: {e.message}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" className="rounded-sm font-mono text-[10px] uppercase gap-1.5" onClick={reset}>
                <RotateCcw size={12} /> Import Another File
              </Button>
              <Button size="sm" className="rounded-sm font-mono text-[10px] uppercase" onClick={() => navigate("/pipeline")}>
                <FileText size={12} className="mr-1" /> Go to Pipeline
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
