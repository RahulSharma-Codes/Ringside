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
  ChevronRight, ChevronLeft, RotateCcw, Info, ChevronDown, ChevronUp, Download,
} from "lucide-react";
import { getListTargetsQueryKey, getGetDashboardSummaryQueryKey, customFetch } from "@workspace/api-client-react";

// ─── Constants ───────────────────────────────────────────────────────────────

// Score fields are intentionally excluded — not importable via CSV/Excel
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
];

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  DB_FIELDS.filter((f) => f.value !== "__skip__").map((f) => [f.value, f.label])
);

// Canonical label→value map derived directly from DB_FIELDS so that
// any header that exactly matches a template label always maps correctly.
const CANONICAL_MAP: Record<string, string> = Object.fromEntries(
  DB_FIELDS.filter((f) => f.value !== "__skip__").map((f) => [
    f.label.toLowerCase().replace(/[\s_\-/]+/g, ""),
    f.value,
  ])
);

// Heuristic auto-map: csv column header → db field (no score fields)
// Canonical template-label matches are checked first so re-importing the
// downloaded template always maps every column correctly without manual edits.
function autoMap(header: string): string {
  const h = header.toLowerCase().replace(/[\s_\-/]+/g, "");
  // 1. Exact canonical match against DB_FIELDS labels (covers all template headers)
  if (CANONICAL_MAP[h]) return CANONICAL_MAP[h];
  // 2. Heuristic aliases for common third-party / custom headers
  const MAP: Record<string, string> = {
    targetcode: "targetCode", code: "targetCode",
    projectname: "projectName", project: "projectName", name: "projectName",
    legalname: "legalName", legal: "legalName",
    businessunit: "businessUnit", bu: "businessUnit", division: "businessUnit",
    sector: "sector", industry: "sector",
    subsector: "subsector", subindustry: "subsector",
    region: "geographyRegion", geographyregion: "geographyRegion", geography: "geographyRegion",
    country: "country", location: "country",
    sourcingchannel: "sourcingChannel", channel: "sourcingChannel",
    sourcingfirm: "sourcingFirm", firm: "sourcingFirm",
    dealowner: "dealOwner", owner: "dealOwner",
    dealchampion: "dealChampion", champion: "dealChampion",
    executivesponsor: "executiveSponsor", sponsor: "executiveSponsor",
    prioritytier: "priorityTier", priority: "priorityTier", tier: "priorityTier",
    stage: "stage", pipelinestage: "stage",
    strategicrationale: "strategicRationale", rationale: "strategicRationale",
    notes: "notes", note: "notes",
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
  existingValues?: Record<string, string>;
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

// ─── Collapsible diff card for update rows ───────────────────────────────────

function UpdateDiffRow({ row }: { row: RowClassified }) {
  const [open, setOpen] = useState(false);
  const fields = row.changedFields ?? [];
  const existing = row.existingValues ?? {};
  const incoming = row.data as Record<string, unknown>;
  const code = String(incoming.targetCode ?? "—");

  return (
    <div className="border border-border rounded-sm">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-muted-foreground w-12 shrink-0">Row {row.rowIndex}</span>
        <span className="font-medium flex-1">{code}</span>
        <div className="flex flex-wrap gap-1 mr-2">
          {fields.slice(0, 3).map((f) => (
            <Badge key={f} variant="outline" className="font-mono text-[9px] rounded-sm border-border">
              {FIELD_LABELS[f] ?? f}
            </Badge>
          ))}
          {fields.length > 3 && (
            <Badge variant="outline" className="font-mono text-[9px] rounded-sm border-border text-muted-foreground">
              +{fields.length - 3} more
            </Badge>
          )}
        </div>
        {open ? <ChevronUp size={12} className="text-muted-foreground shrink-0" /> : <ChevronDown size={12} className="text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-border">
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="bg-muted/20">
                <th className="text-left px-3 py-1.5 text-muted-foreground font-normal w-1/3">Field</th>
                <th className="text-left px-3 py-1.5 text-muted-foreground font-normal w-1/3">Current (DB)</th>
                <th className="text-left px-3 py-1.5 text-muted-foreground font-normal w-1/3">Incoming</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f} className="border-t border-border/50">
                  <td className="px-3 py-1.5 text-muted-foreground">{FIELD_LABELS[f] ?? f}</td>
                  <td className="px-3 py-1.5 text-destructive/70 line-through">
                    {existing[f] || <span className="text-muted-foreground/50 no-underline">(empty)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-green-600 dark:text-green-400">
                    {String(incoming[f] ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Mapped row preview ──────────────────────────────────────────────────────

function MappedRowsPreview({
  rows,
  headers,
  columnMap,
}: {
  rows: ParsedRow[];
  headers: string[];
  columnMap: Record<string, string>;
}) {
  const previewRows = rows.slice(0, 3);
  const mappedHeaders = headers.filter((h) => columnMap[h] && columnMap[h] !== "__skip__");
  if (mappedHeaders.length === 0 || previewRows.length === 0) return null;

  return (
    <div className="bg-muted/20 rounded-sm border border-border overflow-auto max-h-48">
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <Info size={10} className="text-muted-foreground" />
        <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
          Preview of first {previewRows.length} mapped rows
        </span>
      </div>
      <table className="w-full text-[10px] font-mono min-w-max">
        <thead>
          <tr className="border-t border-border bg-muted/30">
            {mappedHeaders.map((h) => (
              <th key={h} className="text-left px-3 py-1.5 text-muted-foreground font-normal whitespace-nowrap">
                {FIELD_LABELS[columnMap[h]] ?? columnMap[h]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row) => (
            <tr key={row.rowIndex} className="border-t border-border/50">
              {mappedHeaders.map((h) => (
                <td key={h} className="px-3 py-1.5 whitespace-nowrap max-w-[160px] truncate">
                  {String(row.data[h] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Raw file preview table ──────────────────────────────────────────────────

function RawFilePreview({ rows, headers }: { rows: ParsedRow[]; headers: string[] }) {
  const previewRows = rows.slice(0, 5);
  return (
    <div className="bg-muted/20 rounded-sm border border-border overflow-auto max-h-48">
      <table className="w-full text-[10px] font-mono min-w-max">
        <thead>
          <tr className="bg-muted/30">
            {headers.map((h) => (
              <th key={h} className="text-left px-3 py-1.5 text-muted-foreground font-normal whitespace-nowrap border-b border-border">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row) => (
            <tr key={row.rowIndex} className="border-t border-border/50">
              {headers.map((h) => (
                <td key={h} className="px-3 py-1.5 whitespace-nowrap max-w-[160px] truncate">
                  {String(row.data[h] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Template CSV download ───────────────────────────────────────────────────

// "notes" is a legacy alias for strategicRationale — excluded from template
// since the canonical "Strategic Rationale" header is already present.
const TEMPLATE_FIELDS = DB_FIELDS.filter(
  (f) => f.value !== "__skip__" && f.value !== "notes"
);

const TEMPLATE_SAMPLE: Record<string, string> = {
  targetCode: "TGT-001",
  projectName: "Acme Corp",
  legalName: "Acme Corporation Ltd.",
  businessUnit: "Corporate Development",
  sector: "Technology",
  subsector: "Software",
  geographyRegion: "North America",
  country: "United States",
  sourcingChannel: "Direct Outreach",
  sourcingFirm: "",
  dealOwner: "Jane Smith",
  dealChampion: "John Doe",
  executiveSponsor: "CEO",
  priorityTier: "Tier 1",
  stage: "Initial Outreach",
  strategicRationale: "Strong product-market fit in adjacent vertical",
};

function downloadTemplate() {
  const headers = TEMPLATE_FIELDS.map((f) => f.label);
  const sampleRow = TEMPLATE_FIELDS.map((f) => TEMPLATE_SAMPLE[f.value] ?? "");
  const csvContent = [headers, sampleRow]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
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
  const [fileReady, setFileReady] = useState(false); // true after file parsed, before advancing to map
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File parsing — stays on upload step, shows preview ──────────────────

  const parseFile = useCallback(async (file: File) => {
    setParseError(null);
    setFileReady(false);
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
          const initialMap: Record<string, string> = {};
          for (const h of hdrs) initialMap[h] = autoMap(h);
          setHeaders(hdrs);
          setRows(parsed);
          setColumnMap(initialMap);
          setFileReady(true); // show preview on upload step
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
        const initialMap: Record<string, string> = {};
        for (const h of hdrs) initialMap[h] = autoMap(h);
        setHeaders(hdrs);
        setRows(dataRows);
        setColumnMap(initialMap);
        setFileReady(true);
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

  // ── Validate (Map → Preview) ─────────────────────────────────────────────

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

  // ── Apply (Apply step → Done) ────────────────────────────────────────────

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
      await queryClient.invalidateQueries({ queryKey: getListTargetsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    } catch (err) {
      setApiError("Apply failed: " + (err instanceof Error ? err.message : String(err)));
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
    setFileReady(false);
    setValidateResult(null);
    setApplyResult(null);
    setApiError(null);
    setIsApplying(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-8 space-y-5 animate-in fade-in duration-500 pb-20 md:pb-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">Import Tracker Data</h1>
        <p className="text-sm text-muted-foreground">Safely import legacy Excel or CSV tracker data without overwriting existing records with blanks.</p>
      </div>

      <StepIndicator step={step} />

      {/* ── Step: Upload ─────────────────────────────────────────────────── */}
      {step === "upload" && (
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Upload File</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!fileReady ? (
              <>
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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Info size={12} className="text-muted-foreground" />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Format Guide</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-sm font-mono text-[10px] uppercase gap-1.5 h-6 border-border text-muted-foreground hover:text-foreground"
                      onClick={downloadTemplate}
                    >
                      <Download size={11} />
                      Download Template
                    </Button>
                  </div>
                  <ul className="space-y-1 text-xs font-mono text-muted-foreground list-disc list-inside">
                    <li>First row must be column headers</li>
                    <li>Rows with an existing <strong>Target Code</strong> will be updated</li>
                    <li>Rows with a new code (+ project name) will be created</li>
                    <li>Blank cells will never overwrite existing data</li>
                    <li>You will map column headers to fields in the next step</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                {/* File parsed — show preview before advancing */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-primary" />
                    <span className="text-xs font-mono font-medium">{fileName}</span>
                    <Badge className="bg-primary/10 text-primary border-0 font-mono text-[9px]">
                      {rows.length} row{rows.length !== 1 ? "s" : ""} detected
                    </Badge>
                    <Badge className="bg-muted text-muted-foreground border-0 font-mono text-[9px]">
                      {headers.length} column{headers.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-sm font-mono text-[10px] uppercase text-muted-foreground h-6"
                    onClick={() => { setFileReady(false); setFileName(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  >
                    Change File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                <RawFilePreview rows={rows} headers={headers} />

                {rows.length > 5 && (
                  <p className="text-[10px] font-mono text-muted-foreground">
                    Showing first 5 of {rows.length} rows
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="rounded-sm font-mono text-[10px] uppercase"
                    onClick={() => setStep("map")}
                  >
                    Continue to Map Columns <ChevronRight size={12} className="ml-1" />
                  </Button>
                </div>
              </>
            )}
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

            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
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

            {/* Mapped rows preview */}
            <MappedRowsPreview rows={rows} headers={headers} columnMap={columnMap} />

            {apiError && (
              <Alert className="border-destructive/50 bg-destructive/10 rounded-sm">
                <AlertDescription className="text-destructive font-mono text-xs">{apiError}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="rounded-sm font-mono text-[10px] uppercase"
                onClick={() => setStep("upload")}>
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

          {/* To Update — collapsible diff per row */}
          {validateResult.toUpdate.length > 0 && (
            <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                  <Badge className="bg-primary/20 text-primary border-0 font-mono text-[9px]">Update</Badge>
                  {validateResult.toUpdate.length} target{validateResult.toUpdate.length !== 1 ? "s" : ""} to update
                  <span className="text-muted-foreground font-normal text-[9px] ml-1">(click a row to see before/after)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {validateResult.toUpdate.map((row) => (
                    <UpdateDiffRow key={row.rowIndex} row={row} />
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

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-sm font-mono text-[10px] uppercase"
              onClick={() => setStep("map")}>
              <ChevronLeft size={12} className="mr-1" /> Back
            </Button>
            <Button
              size="sm"
              className="rounded-sm font-mono text-[10px] uppercase"
              onClick={() => setStep("apply")}
              disabled={validateResult.toCreate.length === 0 && validateResult.toUpdate.length === 0}
            >
              Continue to Apply
              <ChevronRight size={12} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Apply (confirmation) ────────────────────────────────────── */}
      {step === "apply" && validateResult && (
        <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Confirm Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-xs font-mono text-muted-foreground">
              Review the summary below, then click <strong>Confirm &amp; Import</strong> to apply all changes.
              This action cannot be undone from the wizard.
            </p>

            {/* Confirmation summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-sm border border-border p-4 text-center">
                <div className="text-2xl font-bold font-mono text-green-500">{validateResult.toCreate.length}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mt-1">New Targets</div>
              </div>
              <div className="rounded-sm border border-border p-4 text-center">
                <div className="text-2xl font-bold font-mono text-primary">{validateResult.toUpdate.length}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mt-1">Updates</div>
              </div>
              <div className="rounded-sm border border-border p-4 text-center">
                <div className="text-2xl font-bold font-mono text-muted-foreground">{validateResult.toSkip.length}</div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground mt-1">Skipped</div>
              </div>
            </div>

            {isApplying && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Applying import…</p>
                <Progress className="w-full rounded-sm" value={undefined} />
              </div>
            )}

            {apiError && (
              <Alert className="border-destructive/50 bg-destructive/10 rounded-sm">
                <XCircle size={14} className="text-destructive" />
                <AlertDescription className="text-destructive font-mono text-xs">{apiError}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-sm font-mono text-[10px] uppercase"
                onClick={() => setStep("preview")}
                disabled={isApplying}
              >
                <ChevronLeft size={12} className="mr-1" /> Back
              </Button>
              <Button
                size="sm"
                className="rounded-sm font-mono text-[10px] uppercase"
                onClick={handleApply}
                disabled={isApplying}
              >
                {isApplying ? "Importing…" : `Confirm & Import ${validateResult.toCreate.length + validateResult.toUpdate.length} Changes`}
                {!isApplying && <CheckCircle size={12} className="ml-1" />}
              </Button>
            </div>
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
