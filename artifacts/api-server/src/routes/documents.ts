import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import multer from "multer";
import { db } from "@workspace/db";
import { dealDocumentsTable, targetsTable, milestonesTable } from "@workspace/db";
import { z } from "zod";
import {
  storageEnabled,
  uploadFile,
  getSignedUrl,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "../lib/supabase-storage";

const router = Router();

const CRITICAL_DOC_TYPES = ["NDA", "CIM", "Financials", "Legal", "Tax", "Integration"];

// ─── GET /api/documents/storage-config ──────────────────────────────────────
// Returns whether Supabase Storage is configured. Registered before /:id routes.
router.get("/storage-config", (_req, res) => {
  return res.json({
    storageEnabled,
    bucket: storageEnabled ? "deal-documents" : null,
    missingSecrets: storageEnabled
      ? []
      : ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

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
    uploadedAt: d.uploadedAt ? toIso(d.uploadedAt) : null,
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

// ─── GET /api/documents/review ──────────────────────────────────────────────
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
        storagePath: dealDocumentsTable.storagePath,
        fileName: dealDocumentsTable.fileName,
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
    storagePath: d.storagePath ?? null,
    fileName: d.fileName ?? null,
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
  const recentlyReceived = allDocs.filter((d) => d.status === "Received").slice(0, 20).map(fmt);
  const recentlyReviewed = allDocs.filter((d) => d.status === "Reviewed").slice(0, 20).map(fmt);

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

// ─── GET /api/documents/:id/download-url ────────────────────────────────────
// Must be defined before /:id (PUT) so the sub-path resolves correctly.
router.get("/:id/download-url", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [doc] = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.id, id))
    .limit(1);

  if (!doc) return res.status(404).json({ error: "Not found" });

  if (!storageEnabled) {
    return res.json({
      storageEnabled: false,
      signedUrl: null,
      expiresAt: null,
      fileName: doc.fileName ?? null,
    });
  }

  if (!doc.storagePath) {
    return res.json({
      storageEnabled: true,
      signedUrl: null,
      expiresAt: null,
      fileName: doc.fileName ?? null,
    });
  }

  try {
    const { signedUrl, expiresAt } = await getSignedUrl(doc.storagePath);
    return res.json({
      storageEnabled: true,
      signedUrl,
      expiresAt,
      fileName: doc.fileName ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
});

// ─── POST /api/documents/:id/upload ─────────────────────────────────────────
router.post("/:id/upload", upload.single("file"), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  if (!storageEnabled) {
    return res.status(503).json({
      error: "Storage not configured",
      setupRequired: true,
      missingSecrets: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    });
  }

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const [doc] = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.id, id))
    .limit(1);

  if (!doc) return res.status(404).json({ error: "Document not found" });

  try {
    const { storagePath } = await uploadFile({
      targetId: doc.targetId,
      documentId: doc.id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    });

    const now = new Date();
    const [updated] = await db
      .update(dealDocumentsTable)
      .set({
        storagePath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: now,
        updatedAt: now,
      })
      .where(eq(dealDocumentsTable.id, id))
      .returning();

    return res.json(formatDoc(updated));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
});

// ─── PUT /api/documents/:id/replace-file ────────────────────────────────────
router.put("/:id/replace-file", upload.single("file"), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  if (!storageEnabled) {
    return res.status(503).json({
      error: "Storage not configured",
      setupRequired: true,
      missingSecrets: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    });
  }

  if (!req.file) return res.status(400).json({ error: "No file provided" });

  const [doc] = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.id, id))
    .limit(1);

  if (!doc) return res.status(404).json({ error: "Document not found" });

  try {
    const { storagePath } = await uploadFile({
      targetId: doc.targetId,
      documentId: doc.id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    });

    const now = new Date();
    const [updated] = await db
      .update(dealDocumentsTable)
      .set({
        storagePath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: now,
        updatedAt: now,
      })
      .where(eq(dealDocumentsTable.id, id))
      .returning();

    return res.json(formatDoc(updated));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
});

// ─── PUT /api/documents/:id ──────────────────────────────────────────────────
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
