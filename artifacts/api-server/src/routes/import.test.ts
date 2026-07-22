/**
 * Unit tests for applyColumnMap — the column-mapping transformation at the
 * core of the CSV/Excel import wizard.
 *
 * applyColumnMap is a pure function: it takes a raw CSV row (keyed by
 * CSV column names) and a column-map (CSV column → ImportRow field), and
 * returns a typed ImportRow. No DB, no network — tested in isolation.
 *
 * The two key paths covered:
 *   1. Auto-detect path — CSV headers already match camelCase field names
 *      so the column map is an identity mapping.
 *   2. Manual-override path — CSV headers are human-readable labels
 *      (e.g. "Target Code") that the user mapped to fields via the UI.
 */

import { describe, it, expect } from "vitest";
import { applyColumnMap } from "./import";

// ── 1. Auto-detect path (identity mapping) ────────────────────────────────────

describe("applyColumnMap — auto-detect path (identity column map)", () => {
  it("maps all standard fields when CSV headers equal field names", () => {
    const rawRow = {
      targetCode: "TGT-001",
      projectName: "Project Alpha",
      sector: "Healthcare",
      country: "India",
      priorityTier: "Must-Win",
      stage: "Sourcing",
    };
    const columnMap: Record<string, string> = {
      targetCode: "targetCode",
      projectName: "projectName",
      sector: "sector",
      country: "country",
      priorityTier: "priorityTier",
      stage: "stage",
    };

    const result = applyColumnMap(rawRow, columnMap);
    expect(result.targetCode).toBe("TGT-001");
    expect(result.projectName).toBe("Project Alpha");
    expect(result.sector).toBe("Healthcare");
    expect(result.country).toBe("India");
    expect(result.priorityTier).toBe("Must-Win");
    expect(result.stage).toBe("Sourcing");
  });

  it("trims whitespace from values during mapping", () => {
    const rawRow = { targetCode: "  TGT-002  ", projectName: "  Beta  " };
    const columnMap = { targetCode: "targetCode", projectName: "projectName" };
    const result = applyColumnMap(rawRow, columnMap);
    expect(result.targetCode).toBe("TGT-002");
    expect(result.projectName).toBe("Beta");
  });

  it("maps all 16 importable string fields correctly", () => {
    const rawRow: Record<string, string> = {
      targetCode: "T001",
      projectName: "Proj",
      legalName: "LegalCo Ltd",
      businessUnit: "BU-A",
      sector: "Tech",
      subsector: "SaaS",
      geographyRegion: "South Asia",
      country: "India",
      sourcingChannel: "Inbound",
      sourcingFirm: "FirmX",
      dealOwner: "Alice",
      dealChampion: "Bob",
      executiveSponsor: "CEO",
      dealType: "Acquisition",
      priorityTier: "Priority 1",
      strategicRationale: "Core market expansion",
    };
    const columnMap: Record<string, string> = Object.fromEntries(
      Object.keys(rawRow).map((k) => [k, k])
    );
    const result = applyColumnMap(rawRow, columnMap);
    expect(result.targetCode).toBe("T001");
    expect(result.legalName).toBe("LegalCo Ltd");
    expect(result.subsector).toBe("SaaS");
    expect(result.geographyRegion).toBe("South Asia");
    expect(result.sourcingChannel).toBe("Inbound");
    expect(result.sourcingFirm).toBe("FirmX");
    expect(result.dealOwner).toBe("Alice");
    expect(result.dealChampion).toBe("Bob");
    expect(result.executiveSponsor).toBe("CEO");
    expect(result.dealType).toBe("Acquisition");
    expect(result.strategicRationale).toBe("Core market expansion");
  });
});

// ── 2. Manual-override path (non-identity column map) ─────────────────────────

describe("applyColumnMap — manual-override path (human-readable CSV headers)", () => {
  it("maps human-readable column names to field names via the column map", () => {
    const rawRow = {
      "Target Code": "TGT-003",
      "Project Name": "Project Gamma",
      "Priority Tier": "Priority 2",
    };
    const columnMap: Record<string, string> = {
      "Target Code": "targetCode",
      "Project Name": "projectName",
      "Priority Tier": "priorityTier",
    };
    const result = applyColumnMap(rawRow, columnMap);
    expect(result.targetCode).toBe("TGT-003");
    expect(result.projectName).toBe("Project Gamma");
    expect(result.priorityTier).toBe("Priority 2");
  });

  it("maps mixed-case column names with partial override", () => {
    const rawRow = {
      "Company Code": "TGT-004",
      projectName: "Delta",    // this one uses the camelCase field name already
      "Deal Country": "Singapore",
    };
    const columnMap: Record<string, string> = {
      "Company Code": "targetCode",
      projectName: "projectName",
      "Deal Country": "country",
    };
    const result = applyColumnMap(rawRow, columnMap);
    expect(result.targetCode).toBe("TGT-004");
    expect(result.projectName).toBe("Delta");
    expect(result.country).toBe("Singapore");
  });

  it("does not include columns mapped to __skip__", () => {
    const rawRow = { targetCode: "TGT-005", projectName: "Epsilon", notes: "ignore me" };
    const columnMap: Record<string, string> = {
      targetCode: "targetCode",
      projectName: "projectName",
      notes: "__skip__",
    };
    const result = applyColumnMap(rawRow, columnMap);
    expect(result.targetCode).toBe("TGT-005");
    expect(result.projectName).toBe("Epsilon");
    // The "notes" column was skipped, so neither notes nor strategicRationale
    // should appear from that column
    expect(result.strategicRationale).toBeUndefined();
  });

  it("does not include columns with an empty string mapping (unmapped columns)", () => {
    const rawRow = { targetCode: "TGT-006", UnknownCol: "some value" };
    const columnMap: Record<string, string> = {
      targetCode: "targetCode",
      UnknownCol: "", // empty = treat as skip
    };
    const result = applyColumnMap(rawRow, columnMap);
    expect(result.targetCode).toBe("TGT-006");
    expect(Object.keys(result)).not.toContain("UnknownCol");
  });
});

// ── 3. Safety rules ───────────────────────────────────────────────────────────

describe("applyColumnMap — safety rules", () => {
  it("skips blank values — never overwrites a field with an empty string", () => {
    const rawRow = { targetCode: "TGT-007", projectName: "  ", country: "" };
    const columnMap: Record<string, string> = {
      targetCode: "targetCode",
      projectName: "projectName",
      country: "country",
    };
    const result = applyColumnMap(rawRow, columnMap);
    expect(result.targetCode).toBe("TGT-007");
    expect(result.projectName).toBeUndefined(); // blank → not included
    expect(result.country).toBeUndefined();     // empty → not included
  });

  it("silently ignores score fields even if explicitly mapped", () => {
    const rawRow = {
      targetCode: "TGT-008",
      projectName: "Zeta",
      strategicFitScore: "9",    // a score field — must be ignored
      synergyScore: "7",
    };
    const columnMap: Record<string, string> = {
      targetCode: "targetCode",
      projectName: "projectName",
      strategicFitScore: "strategicFitScore",  // not in ALLOWED_FIELDS
      synergyScore: "synergyScore",              // not in ALLOWED_FIELDS
    };
    const result = applyColumnMap(rawRow, columnMap);
    expect(result.targetCode).toBe("TGT-008");
    expect(result.projectName).toBe("Zeta");
    // Score fields must not appear in the result
    expect(Object.keys(result)).not.toContain("strategicFitScore");
    expect(Object.keys(result)).not.toContain("synergyScore");
  });

  it("does not produce undefined keys in the result object", () => {
    const rawRow = { targetCode: "TGT-009", projectName: "Eta" };
    const columnMap: Record<string, string> = {
      targetCode: "targetCode",
      projectName: "projectName",
    };
    const result = applyColumnMap(rawRow, columnMap);
    for (const [key, val] of Object.entries(result)) {
      expect(val, `Key "${key}" must not be undefined`).not.toBeUndefined();
    }
  });
});

// ── 4. Notes alias resolution ─────────────────────────────────────────────────

describe("applyColumnMap — notes alias → strategicRationale", () => {
  it("promotes 'notes' to strategicRationale when strategicRationale is not mapped", () => {
    const rawRow = { targetCode: "TGT-010", notes: "Key rationale text" };
    const columnMap: Record<string, string> = {
      targetCode: "targetCode",
      notes: "notes",
    };
    const result = applyColumnMap(rawRow, columnMap);
    expect(result.strategicRationale).toBe("Key rationale text");
    // The raw 'notes' key itself must not survive in the result
    expect(Object.keys(result)).not.toContain("notes");
  });

  it("drops 'notes' when strategicRationale is already mapped (strategicRationale wins)", () => {
    const rawRow = {
      targetCode: "TGT-011",
      notes: "Notes value (ignored)",
      rationale: "Rationale wins",
    };
    const columnMap: Record<string, string> = {
      targetCode: "targetCode",
      notes: "notes",
      rationale: "strategicRationale",
    };
    const result = applyColumnMap(rawRow, columnMap);
    expect(result.strategicRationale).toBe("Rationale wins");
    expect(Object.keys(result)).not.toContain("notes");
  });
});
