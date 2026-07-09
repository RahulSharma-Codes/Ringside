import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  stageChangeLogTable,
} from "@workspace/db";
import { VALID_TIERS, VALID_STAGES, TERMINAL_STAGES } from "../constants";
import { getAccessScope, grantTargetAccess } from "../lib/target-access";

const router = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImportRow {
  targetCode?: string;
  projectName?: string;
  legalName?: string;
  businessUnit?: string;
  sector?: string;
  subsector?: string;
  geographyRegion?: string;
  country?: string;
  sourcingChannel?: string;
  sourcingFirm?: string;
  dealOwner?: string;
  dealChampion?: string;
  executiveSponsor?: string;
  priorityTier?: string;
  stage?: string;
  strategicRationale?: string;
}

interface RawRequestRow {
  rowIndex: number;
  data: Record<string, unknown>;
}

interface RowClassified {
  rowIndex: number;
  data: ImportRow;
  existingId?: number;
  changedFields?: string[];
  newStage?: string;
  /** Current DB values for each changed field — used to render before/after diff in UI */
  existingValues?: Record<string, string>;
}

interface RowSkipped {
  rowIndex: number;
  targetCode?: string;
  reason: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function isBlank(v: unknown): boolean {
  return str(v) === "";
}

function defaultMilestoneValues(targetId: number, now: Date, stage = "Sourcing") {
  return {
    targetId,
    currentStage: stage,
    stageEnteredAt: now,
    ndaStatus: "Not Sent",
    dataRoomAccess: "No",
    commercialDdStatus: "Not Started",
    financialDdStatus: "Not Started",
    legalDdStatus: "Not Started",
    taxDdStatus: "Not Started",
    techDdStatus: "Not Started",
    updatedAt: now,
  };
}

// Allowed importable fields — score fields are explicitly excluded (out of scope)
const ALLOWED_FIELDS = new Set([
  "targetCode", "projectName", "legalName", "businessUnit", "sector",
  "subsector", "geographyRegion", "country", "sourcingChannel", "sourcingFirm",
  "dealOwner", "dealChampion", "executiveSponsor", "priorityTier", "stage",
  "strategicRationale", "notes",
]);

/** Map raw row through the column map, producing a typed ImportRow.
 *  Score fields are silently ignored — they are out of scope for import. */
function applyColumnMap(
  rawRow: Record<string, unknown>,
  columnMap: Record<string, string>,
): ImportRow {
  const mapped: Record<string, unknown> = {};

  for (const [csvCol, field] of Object.entries(columnMap)) {
    if (!field || field === "__skip__") continue;
    if (!ALLOWED_FIELDS.has(field)) continue; // silently skip score/unknown fields
    const val = rawRow[csvCol];
    if (isBlank(val)) continue;
    mapped[field] = str(val);
  }

  // Resolve "notes" alias → strategicRationale (only if strategicRationale not already mapped)
  if ("notes" in mapped && !("strategicRationale" in mapped)) {
    mapped["strategicRationale"] = mapped["notes"];
    delete mapped["notes"];
  } else if ("notes" in mapped) {
    delete mapped["notes"];
  }

  const result: ImportRow = {};
  const s = (key: string) => (typeof mapped[key] === "string" ? (mapped[key] as string) : undefined);

  result.targetCode = s("targetCode");
  result.projectName = s("projectName");
  result.legalName = s("legalName");
  result.businessUnit = s("businessUnit");
  result.sector = s("sector");
  result.subsector = s("subsector");
  result.geographyRegion = s("geographyRegion");
  result.country = s("country");
  result.sourcingChannel = s("sourcingChannel");
  result.sourcingFirm = s("sourcingFirm");
  result.dealOwner = s("dealOwner");
  result.dealChampion = s("dealChampion");
  result.executiveSponsor = s("executiveSponsor");
  result.priorityTier = s("priorityTier");
  result.stage = s("stage");
  result.strategicRationale = s("strategicRationale");

  // Remove undefined keys
  for (const key of Object.keys(result) as (keyof ImportRow)[]) {
    if (result[key] === undefined) delete result[key];
  }

  return result;
}

// ─── POST /api/import/validate ────────────────────────────────────────────────

router.post("/validate", async (req, res) => {
  const body = req.body as {
    rows?: unknown;
    columnMap?: unknown;
  };

  if (!Array.isArray(body.rows) || typeof body.columnMap !== "object" || !body.columnMap) {
    return res.status(400).json({ error: "rows (array) and columnMap (object) are required" });
  }

  const rows = body.rows as RawRequestRow[];
  const columnMap = body.columnMap as Record<string, string>;
  const warnings: string[] = [];

  const hasBothRationaleAndNotes =
    Object.values(columnMap).includes("strategicRationale") &&
    Object.values(columnMap).includes("notes");
  if (hasBothRationaleAndNotes) {
    warnings.push(
      "Both 'Notes' and 'Strategic Rationale' columns are mapped. 'Notes' will be ignored since 'Strategic Rationale' takes priority.",
    );
  }

  // Fetch existing targets for match lookup (only importable string fields)
  const existingRows = await db
    .select({
      id: targetsTable.id,
      targetCode: targetsTable.targetCode,
      projectName: targetsTable.projectName,
      legalName: targetsTable.legalName,
      businessUnit: targetsTable.businessUnit,
      sector: targetsTable.sector,
      subsector: targetsTable.subsector,
      geographyRegion: targetsTable.geographyRegion,
      country: targetsTable.country,
      sourcingChannel: targetsTable.sourcingChannel,
      sourcingFirm: targetsTable.sourcingFirm,
      dealOwner: targetsTable.dealOwner,
      dealChampion: targetsTable.dealChampion,
      executiveSponsor: targetsTable.executiveSponsor,
      priorityTier: targetsTable.priorityTier,
      strategicRationale: targetsTable.strategicRationale,
    })
    .from(targetsTable);

  const existingMilestones = await db
    .select({ targetId: milestonesTable.targetId, currentStage: milestonesTable.currentStage })
    .from(milestonesTable);

  const codeToExisting = new Map(existingRows.map((r) => [r.targetCode.toLowerCase(), r]));
  const idToStage = new Map(existingMilestones.map((m) => [m.targetId, m.currentStage]));

  const toCreate: RowClassified[] = [];
  const toUpdate: RowClassified[] = [];
  const toSkip: RowSkipped[] = [];

  for (const { rowIndex, data: rawRow } of rows) {
    if (!rawRow || typeof rawRow !== "object") {
      toSkip.push({ rowIndex, reason: "Row data is missing or invalid." });
      continue;
    }

    const data = applyColumnMap(rawRow as Record<string, unknown>, columnMap);

    if (data.priorityTier && !VALID_TIERS.has(data.priorityTier)) {
      toSkip.push({
        rowIndex,
        targetCode: data.targetCode,
        reason: `Invalid priorityTier: "${data.priorityTier}". Valid values: ${[...VALID_TIERS].join(", ")}`,
      });
      continue;
    }

    if (data.stage && !VALID_STAGES.has(data.stage)) {
      toSkip.push({
        rowIndex,
        targetCode: data.targetCode,
        reason: `Invalid stage: "${data.stage}". Not a recognized pipeline stage.`,
      });
      continue;
    }

    const code = data.targetCode?.toLowerCase();

    if (code && codeToExisting.has(code)) {
      // UPDATE path — compare only importable string fields (no scores)
      const existing = codeToExisting.get(code)!;
      const changedFields: string[] = [];
      const existingValues: Record<string, string> = {};

      type StringField = keyof Pick<ImportRow,
        "projectName" | "legalName" | "businessUnit" | "sector" | "subsector" |
        "geographyRegion" | "country" | "sourcingChannel" | "sourcingFirm" |
        "dealOwner" | "dealChampion" | "executiveSponsor" | "priorityTier" | "strategicRationale"
      >;

      const STRING_FIELDS: StringField[] = [
        "projectName", "legalName", "businessUnit", "sector", "subsector",
        "geographyRegion", "country", "sourcingChannel", "sourcingFirm",
        "dealOwner", "dealChampion", "executiveSponsor", "priorityTier", "strategicRationale",
      ];

      for (const field of STRING_FIELDS) {
        const incoming = data[field];
        if (incoming === undefined || isBlank(incoming)) continue;
        const dbVal = (existing as Record<string, unknown>)[field];
        if (String(incoming) !== String(dbVal ?? "")) {
          changedFields.push(field);
          existingValues[field] = String(dbVal ?? "");
        }
      }

      let newStage: string | undefined;
      if (data.stage) {
        const currentStage = idToStage.get(existing.id) ?? "Sourcing";
        if (data.stage !== currentStage) {
          newStage = data.stage;
          changedFields.push("stage");
          existingValues["stage"] = currentStage;
        }
      }

      if (changedFields.length === 0) {
        toSkip.push({
          rowIndex,
          targetCode: data.targetCode,
          reason: "No changes detected — all incoming values match existing data.",
        });
        continue;
      }

      toUpdate.push({ rowIndex, data, existingId: existing.id, changedFields, newStage, existingValues });
    } else {
      // CREATE path
      if (!data.targetCode || !data.projectName) {
        toSkip.push({
          rowIndex,
          targetCode: data.targetCode,
          reason: `New target requires both "targetCode" and "projectName". Missing: ${
            !data.targetCode ? "targetCode" : "projectName"
          }.`,
        });
        continue;
      }
      toCreate.push({ rowIndex, data });
    }
  }

  return res.json({ toCreate, toUpdate, toSkip, warnings });
});

// ─── POST /api/import/apply ───────────────────────────────────────────────────

router.post("/apply", async (req, res) => {
  const body = req.body as {
    toCreate?: unknown;
    toUpdate?: unknown;
    changedBy?: string;
  };

  if (!Array.isArray(body.toCreate) || !Array.isArray(body.toUpdate)) {
    return res.status(400).json({ error: "toCreate and toUpdate arrays are required" });
  }

  const toCreate = body.toCreate as Array<{ rowIndex: number; data: ImportRow }>;
  const toUpdate = body.toUpdate as Array<{
    rowIndex: number;
    existingId: number;
    data: ImportRow;
    changedFields: string[];
    newStage?: string;
  }>;
  const actor = typeof body.changedBy === "string" ? body.changedBy : "Import";

  const scope = await getAccessScope(req);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { rowIndex: number; message: string }[] = [];

  // ── Creates ───────────────────────────────────────────────────────────────
  for (const { rowIndex, data } of toCreate) {
    try {
      if (!data.targetCode || !data.projectName) {
        errors.push({ rowIndex, message: "targetCode and projectName are required" });
        skipped++;
        continue;
      }

      // Server-side revalidation: reject invalid tier/stage from client payload
      if (data.priorityTier && !VALID_TIERS.has(data.priorityTier)) {
        errors.push({ rowIndex, message: `Invalid priorityTier: "${data.priorityTier}"` });
        skipped++;
        continue;
      }
      if (data.stage && !VALID_STAGES.has(data.stage)) {
        errors.push({ rowIndex, message: `Invalid stage: "${data.stage}"` });
        skipped++;
        continue;
      }

      const now = new Date();
      const initialStage = data.stage && VALID_STAGES.has(data.stage) ? data.stage : "Sourcing";

      const [target] = await db
        .insert(targetsTable)
        .values({
          targetCode: data.targetCode,
          projectName: data.projectName,
          legalName: data.legalName ?? null,
          businessUnit: data.businessUnit ?? null,
          sector: data.sector ?? null,
          subsector: data.subsector ?? null,
          geographyRegion: data.geographyRegion ?? null,
          country: data.country ?? null,
          sourcingChannel: data.sourcingChannel ?? null,
          sourcingFirm: data.sourcingFirm ?? null,
          dealOwner: data.dealOwner ?? null,
          dealChampion: data.dealChampion ?? null,
          executiveSponsor: data.executiveSponsor ?? null,
          priorityTier: data.priorityTier ?? "Watchlist",
          strategicRationale: data.strategicRationale ?? null,
          // Scores are not importable — set to DB defaults explicitly
          strategicFitScore: 50,
          synergyScore: 50,
          financialAttractivenessScore: 50,
          processMaturityScore: 50,
          riskPenaltyScore: 0,
          isActive: !TERMINAL_STAGES.has(initialStage),
          isConfidential: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await db
        .insert(milestonesTable)
        .values(defaultMilestoneValues(target.id, now, initialStage));

      await db.insert(stageChangeLogTable).values({
        targetId: target.id,
        previousStage: null,
        newStage: initialStage,
        changedBy: actor,
        changeReason: "Created via CSV/Excel import",
        changedAt: now,
      });

      if (scope.userId) await grantTargetAccess(target.id, scope.userId, scope.userId);

      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push({ rowIndex, message: msg });
      skipped++;
    }
  }

  // ── Updates ───────────────────────────────────────────────────────────────
  for (const { rowIndex, existingId, data, changedFields, newStage } of toUpdate) {
    try {
      // Server-side revalidation: existingId must be a positive integer
      if (!existingId || typeof existingId !== "number" || existingId < 1) {
        errors.push({ rowIndex, message: "existingId must be a valid target ID" });
        skipped++;
        continue;
      }
      if (!scope.isAdmin && !scope.accessibleTargetIds.includes(existingId)) {
        errors.push({ rowIndex, message: "Not authorized to update this target" });
        skipped++;
        continue;
      }
      // Reject crafted invalid tier/stage values
      if (data.priorityTier && !VALID_TIERS.has(data.priorityTier)) {
        errors.push({ rowIndex, message: `Invalid priorityTier: "${data.priorityTier}"` });
        skipped++;
        continue;
      }
      if (newStage && !VALID_STAGES.has(newStage)) {
        errors.push({ rowIndex, message: `Invalid stage: "${newStage}"` });
        skipped++;
        continue;
      }

      const now = new Date();

      // Build patch for non-stage fields — never include score fields
      const patch: Partial<typeof targetsTable.$inferInsert> & { updatedAt: Date } = {
        updatedAt: now,
      };

      if (changedFields.includes("projectName") && !isBlank(data.projectName))
        patch.projectName = data.projectName!;
      if (changedFields.includes("legalName") && !isBlank(data.legalName))
        patch.legalName = data.legalName!;
      if (changedFields.includes("businessUnit") && !isBlank(data.businessUnit))
        patch.businessUnit = data.businessUnit!;
      if (changedFields.includes("sector") && !isBlank(data.sector))
        patch.sector = data.sector!;
      if (changedFields.includes("subsector") && !isBlank(data.subsector))
        patch.subsector = data.subsector!;
      if (changedFields.includes("geographyRegion") && !isBlank(data.geographyRegion))
        patch.geographyRegion = data.geographyRegion!;
      if (changedFields.includes("country") && !isBlank(data.country))
        patch.country = data.country!;
      if (changedFields.includes("sourcingChannel") && !isBlank(data.sourcingChannel))
        patch.sourcingChannel = data.sourcingChannel!;
      if (changedFields.includes("sourcingFirm") && !isBlank(data.sourcingFirm))
        patch.sourcingFirm = data.sourcingFirm!;
      if (changedFields.includes("dealOwner") && !isBlank(data.dealOwner))
        patch.dealOwner = data.dealOwner!;
      if (changedFields.includes("dealChampion") && !isBlank(data.dealChampion))
        patch.dealChampion = data.dealChampion!;
      if (changedFields.includes("executiveSponsor") && !isBlank(data.executiveSponsor))
        patch.executiveSponsor = data.executiveSponsor!;
      if (changedFields.includes("priorityTier") && !isBlank(data.priorityTier))
        patch.priorityTier = data.priorityTier!;
      if (changedFields.includes("strategicRationale") && !isBlank(data.strategicRationale))
        patch.strategicRationale = data.strategicRationale!;

      // If stage is changing, fold isActive into the same targets UPDATE
      if (newStage && changedFields.includes("stage") && VALID_STAGES.has(newStage)) {
        patch.isActive = !TERMINAL_STAGES.has(newStage);
      }

      // Always update targets table (bumps updatedAt + any field/isActive changes)
      await db
        .update(targetsTable)
        .set(patch)
        .where(eq(targetsTable.id, existingId));

      // Stage change — mirrors PUT /:id/stage: milestone upsert + stage log
      if (newStage && changedFields.includes("stage") && VALID_STAGES.has(newStage)) {
        const [existingMilestone] = await db
          .select({ currentStage: milestonesTable.currentStage })
          .from(milestonesTable)
          .where(eq(milestonesTable.targetId, existingId));

        const previousStage = existingMilestone?.currentStage ?? null;

        if (existingMilestone) {
          // Update existing milestone row
          await db
            .update(milestonesTable)
            .set({ currentStage: newStage, stageEnteredAt: now, updatedAt: now })
            .where(eq(milestonesTable.targetId, existingId));
        } else {
          // No milestone row yet — create one (same as PUT /:id/stage else branch)
          await db
            .insert(milestonesTable)
            .values(defaultMilestoneValues(existingId, now, newStage));
        }

        await db.insert(stageChangeLogTable).values({
          targetId: existingId,
          previousStage,
          newStage,
          changedBy: actor,
          changeReason: "Updated via CSV/Excel import",
          changedAt: now,
        });
      }

      updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push({ rowIndex, message: msg });
      skipped++;
    }
  }

  return res.json({ created, updated, skipped, errors });
});

export default router;
