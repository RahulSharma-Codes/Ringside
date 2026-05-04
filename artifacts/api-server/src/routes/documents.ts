import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { dealDocumentsTable, targetsTable, milestonesTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const CRITICAL_DOC_TYPES = ["NDA", "CIM", "Financials", "Legal", "Tax", "Integration"];

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toDateString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatDoc(d: typeof dealDocumentsTable.$inferSelect) {
  return {
    ...d,
    documentDate: toDateString(d.documentDate),
    createdAt: toIso(d.createdAt)!,
    updatedAt: toIso(d.updatedAt)!,
  };
}

const UpdateDocSchema = z.object({
  title: z.string().min(1).optional(),
  documentType: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  workstream: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// GET /api/documents/review — pipeline-wide document review
// NOTE: this route must be registered before /:id to avoid "review" matching as an id param.
router.get("/review", async (_req, res) => {
  const [allDocs, allTargets] = await Promise.all([
    db
      .select({
        id: dealDocumentsTable.id,
        targetId: dealDocumentsTable.targetId,
        title: dealDocumentsTable.title,
        documentType: dealDocumentsTable.documentType,
        status: dealDocumentsTable.status,
        owner: dealDocumentsTable.owner,
        documentDate: dealDocumentsTable.documentDate,
        url: dealDocumentsTable.url,
        workstream: dealDocumentsTable.workstream,
        notes: dealDocumentsTable.notes,
        createdAt: dealDocumentsTable.createdAt,
        updatedAt: dealDocumentsTable.updatedAt,
        targetCode: targetsTable.targetCode,
        projectName: targetsTable.projectName,
        priorityTier: targetsTable.priorityTier,
        currentStage: milestonesTable.currentStage,
      })
      .from(dealDocumentsTable)
      .leftJoin(targetsTable, eq(dealDocumentsTable.targetId, targetsTable.id))
      .leftJoin(milestonesTable, eq(milestonesTable.targetId, dealDocumentsTable.targetId))
      .orderBy(desc(dealDocumentsTable.updatedAt)),
    db
      .select({
        id: targetsTable.id,
        targetCode: targetsTable.targetCode,
        projectName: targetsTable.projectName,
        priorityTier: targetsTable.priorityTier,
        isActive: targetsTable.isActive,
      })
      .from(targetsTable),
  ]);

  const fmt = (d: (typeof allDocs)[number]) => ({
    id: d.id,
    targetId: d.targetId,
    targetCode: d.targetCode ?? null,
    projectName: d.projectName ?? null,
    priorityTier: d.priorityTier ?? null,
    currentStage: d.currentStage ?? "Sourcing",
    title: d.title,
    documentType: d.documentType,
    status: d.status,
    owner: d.owner ?? null,
    documentDate: toDateString(d.documentDate),
    url: d.url ?? null,
    workstream: d.workstream ?? null,
    notes: d.notes ?? null,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  });

  const missingCritical = allDocs
    .filter(
      (d) =>
        CRITICAL_DOC_TYPES.includes(d.documentType) &&
        (d.status === "Missing" || d.status === "Requested"),
    )
    .map(fmt);

  const requested = allDocs.filter((d) => d.status === "Requested").map(fmt);
  const underReview = allDocs.filter((d) => d.status === "Under Review").map(fmt);
  const recentlyReceived = allDocs
    .filter((d) => d.status === "Received")
    .slice(0, 20)
    .map(fmt);
  const recentlyReviewed = allDocs
    .filter((d) => d.status === "Reviewed")
    .slice(0, 20)
    .map(fmt);

  const docsByTarget = new Map<number, (typeof allDocs)>();
  for (const d of allDocs) {
    if (!docsByTarget.has(d.targetId)) docsByTarget.set(d.targetId, []);
    docsByTarget.get(d.targetId)!.push(d);
  }

  const mustWinTargets = allTargets.filter(
    (t) => t.isActive !== false && t.priorityTier === "Must-Win",
  );
  const mustWinMissing = mustWinTargets.flatMap((t) => {
    const tDocs = docsByTarget.get(t.id) ?? [];
    const covered = new Set(
      tDocs
        .filter(
          (d) =>
            d.status !== "Missing" &&
            d.status !== "Requested" &&
            d.status !== "Not Applicable",
        )
        .map((d) => d.documentType),
    );
    const missingCriticalTypes = CRITICAL_DOC_TYPES.filter((ct) => !covered.has(ct));
    if (missingCriticalTypes.length === 0) return [];
    return [
      {
        targetId: t.id,
        targetCode: t.targetCode ?? null,
        projectName: t.projectName ?? null,
        priorityTier: t.priorityTier ?? null,
        currentStage: null as string | null,
        missingCriticalTypes,
      },
    ];
  });

  return res.json({
    missingCritical,
    requested,
    underReview,
    recentlyReceived,
    recentlyReviewed,
    mustWinMissing,
  });
});

// PUT /api/documents/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const parsed = UpdateDocSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();

  const [doc] = await db
    .update(dealDocumentsTable)
    .set({
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.documentType !== undefined ? { documentType: d.documentType } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.owner !== undefined ? { owner: d.owner } : {}),
      ...(d.documentDate !== undefined ? { documentDate: d.documentDate ?? null } : {}),
      ...(d.url !== undefined ? { url: d.url ?? null } : {}),
      ...(d.workstream !== undefined ? { workstream: d.workstream ?? null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes ?? null } : {}),
      updatedAt: now,
    })
    .where(eq(dealDocumentsTable.id, id))
    .returning();

  if (!doc) return res.status(404).json({ error: "Not found" });
  return res.json(formatDoc(doc));
});

export default router;
