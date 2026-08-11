import { randomUUID } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, inArray, ne } from "drizzle-orm";
import multer from "multer";
import { db } from "@workspace/db";
import { dealDocumentsTable, targetsTable, milestonesTable } from "@workspace/db";
import { z } from "zod";
import {
  storageEnabled,
  uploadFile,
  getSignedUrl,
  deleteFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "../lib/object-storage";
import { writeAuditEvent } from "./audit";
import { canAccessTarget, getAccessScope } from "../lib/target-access";
import { extractText } from "../lib/extract-text";

const router = Router();

const CRITICAL_DOC_TYPES = ["NDA", "CIM", "Financials", "Legal", "Tax", "Integration"];

/**
 * Document types that are eligible for text extraction.
 * Only Teaser, IM, and Business Model documents feed the AI brief (S7);
 * all other types — including Highly-Restricted classified documents — are
 * skipped to avoid creating plaintext copies of confidential material.
 */
const EXTRACTABLE_DOC_TYPES = new Set(["Teaser", "IM", "Business Model"]);
const EXTRACTABLE_DOC_TYPES_ARRAY = [...EXTRACTABLE_DOC_TYPES];

function shouldExtract(documentType: string, classification: string): boolean {
  return (
    EXTRACTABLE_DOC_TYPES.has(documentType) &&
    classification !== "Highly-Restricted"
  );
}

/**
 * Schedules a fire-and-forget text extraction job after a file upload.
 *
 * Race-safety: the final UPDATE is guarded by two WHERE conditions:
 *   1. upload_version = expectedUploadVersion — an immutable UUID generated fresh
 *      on every upload/replacement. Because storage paths are deterministic
 *      (documentId + filename), same-name replacements produce the same path;
 *      only the upload_version column is guaranteed to change each time, making
 *      it a reliable per-version sentinel. A stale extraction from a prior
 *      replacement cannot overwrite the current extraction because the version
 *      will no longer match.
 *   2. document_type IN (...extractable) AND classification != 'Highly-Restricted' —
 *      ensures we never write extracted text if the document was reclassified
 *      or its type changed to ineligible while extraction was in flight.
 *
 * If either condition fails the UPDATE is a no-op, leaving the row unchanged.
 * Status stays 'pending' in that case; a subsequent eligible write or
 * metadata PUT will set the correct final state.
 *
 * For ineligible documents, schedules an immediate 'unsupported' status write
 * (also guarded by uploadVersion so it doesn't stomp a concurrent replacement).
 */
function scheduleExtraction({
  documentId,
  expectedUploadVersion,
  documentType,
  classification,
  fileBuffer,
  fileMime,
  logFn,
}: {
  documentId: number;
  expectedUploadVersion: string;
  documentType: string;
  classification: string;
  fileBuffer: Buffer;
  fileMime: string;
  logFn: (err: unknown) => void;
}): void {
  if (shouldExtract(documentType, classification)) {
    setImmediate(() => {
      extractText(fileBuffer, fileMime)
        .then(({ text, status }) => {
          // Conditional write: only applies when the upload version and eligibility match.
          return db
            .update(dealDocumentsTable)
            .set({ extractedText: text, extractionStatus: status, updatedAt: new Date() })
            .where(
              and(
                eq(dealDocumentsTable.id, documentId),
                eq(dealDocumentsTable.uploadVersion, expectedUploadVersion),
                inArray(dealDocumentsTable.documentType, EXTRACTABLE_DOC_TYPES_ARRAY),
                ne(dealDocumentsTable.classification, "Highly-Restricted"),
              ),
            );
        })
        .catch((err: unknown) => {
          logFn(err);
          // On extraction failure, write 'failed' — but only for the same upload version.
          return db
            .update(dealDocumentsTable)
            .set({ extractionStatus: "failed", updatedAt: new Date() })
            .where(
              and(
                eq(dealDocumentsTable.id, documentId),
                eq(dealDocumentsTable.uploadVersion, expectedUploadVersion),
                inArray(dealDocumentsTable.documentType, EXTRACTABLE_DOC_TYPES_ARRAY),
                ne(dealDocumentsTable.classification, "Highly-Restricted"),
              ),
            )
            .catch(() => undefined);
        });
    });
  } else {
    // Ineligible — set status immediately so it is never left as 'pending'.
    // Guard by uploadVersion so concurrent replacements don't collide.
    setImmediate(() => {
      db.update(dealDocumentsTable)
        .set({ extractedText: null, extractionStatus: "unsupported", updatedAt: new Date() })
        .where(
          and(
            eq(dealDocumentsTable.id, documentId),
            eq(dealDocumentsTable.uploadVersion, expectedUploadVersion),
          ),
        )
        .catch(() => undefined);
    });
  }
}

// ─── GET /api/documents/storage-config ──────────────────────────────────────
// Returns whether object storage is configured. Registered before /:id routes.
// NOTE: bucket name intentionally omitted — it is an internal infrastructure
// detail and must not be surfaced to clients.
router.get("/storage-config", (_req, res) => {
  return res.json({
    storageEnabled,
    missingSecrets: storageEnabled ? [] : ["DEFAULT_OBJECT_STORAGE_BUCKET_ID"],
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
  // extractedText is omitted intentionally — it is large, classification-sensitive,
  // and consumed server-side only (AI brief S7 via direct DB JOIN).
  // extractionStatus is included for UI/observability.
  const { extractedText: _omit, ...rest } = d;
  void _omit;
  return {
    ...rest,
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
  classification: z.string().optional(),
  owner: z.string().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  workstream: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── GET /api/documents/review ──────────────────────────────────────────────
// NOTE: this route must be registered before /:id to avoid "review" matching as an id param.
router.get("/review", async (req, res) => {
  const scope = await getAccessScope(req);
  if (!scope.isAdmin && scope.accessibleTargetIds.length === 0) {
    return res.json({
      missingCritical: [],
      requested: [],
      underReview: [],
      recentlyReceived: [],
      recentlyReviewed: [],
      mustWinMissing: [],
    });
  }
  const [allDocsRaw, allTargetsRaw] = await Promise.all([
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

  const allDocs = scope.isAdmin
    ? allDocsRaw
    : allDocsRaw.filter((d) => scope.accessibleTargetIds.includes(d.targetId));
  const allTargets = scope.isAdmin
    ? allTargetsRaw
    : allTargetsRaw.filter((t) => scope.accessibleTargetIds.includes(t.id));

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
  if (!(await canAccessTarget(req, doc.targetId))) return res.status(404).json({ error: "Not found" });

  // For Highly-Restricted documents, allow only the deal owner (or Admin role) to download.
  // Requester identity MUST come from verified JWT claims (req.jwtClaims).
  // If no JWT identity is available (e.g. legacy shared-password session), access is denied —
  // the download endpoint requires a per-user token to make an access-control decision.
  if (doc.classification === "Highly-Restricted") {
    const claims = req.jwtClaims;

    if (!claims) {
      // No verified identity — deny to enforce the classification policy.
      return res.status(403).json({
        error: "Access restricted",
        classification: "Highly-Restricted",
        message: "Highly-Restricted documents require a personal login. Please sign in with your email to access.",
      });
    }

    let isOwner = claims.role === "Admin";

    if (!isOwner) {
      // Verify the JWT email matches the target's dealOwner (strict, case-insensitive equality)
      const [target] = await db
        .select({ dealOwner: targetsTable.dealOwner })
        .from(targetsTable)
        .where(eq(targetsTable.id, doc.targetId))
        .limit(1);

      const dealOwner = (target?.dealOwner ?? "").trim().toLowerCase();
      const requesterEmail = claims.email.trim().toLowerCase();

      isOwner = dealOwner.length > 0 && requesterEmail === dealOwner;
    }

    if (!isOwner) {
      return res.status(403).json({
        error: "Access restricted",
        classification: "Highly-Restricted",
        message: "This document is Highly-Restricted. Contact the deal owner to request access.",
      });
    }
  }

  if (!storageEnabled) {
    return res.json({
      storageEnabled: false,
      signedUrl: null,
      expiresAt: null,
      fileName: doc.fileName ?? null,
      classification: doc.classification ?? "Restricted",
    });
  }

  if (!doc.storagePath) {
    return res.json({
      storageEnabled: true,
      signedUrl: null,
      expiresAt: null,
      fileName: doc.fileName ?? null,
      classification: doc.classification ?? "Restricted",
    });
  }

  try {
    const { signedUrl, expiresAt } = await getSignedUrl(doc.storagePath);
    await writeAuditEvent("document_downloaded", doc.targetId, null, {
      documentId: doc.id,
      title: doc.title,
      documentType: doc.documentType,
    });
    return res.json({
      storageEnabled: true,
      signedUrl,
      expiresAt,
      fileName: doc.fileName ?? null,
      classification: doc.classification ?? "Restricted",
    });
  } catch (err) {
    req.log.error({ err }, "Storage error generating signed URL");
    return res.status(500).json({ error: "Could not generate download link. Please try again." });
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
      missingSecrets: ["DEFAULT_OBJECT_STORAGE_BUCKET_ID"],
    });
  }

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const [doc] = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.id, id))
    .limit(1);

  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (!(await canAccessTarget(req, doc.targetId))) return res.status(404).json({ error: "Document not found" });

  try {
    const { storagePath } = await uploadFile({
      targetId: doc.targetId,
      documentId: doc.id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    });

    // A fresh UUID is generated on every upload so the background extraction
    // callback can guard against stale writes even when the same filename is
    // re-uploaded (which would otherwise produce the same storage path).
    const uploadVersion = randomUUID();
    const now = new Date();
    const [updated] = await db
      .update(dealDocumentsTable)
      .set({
        storagePath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: now,
        // Reset extraction state atomically so no stale content persists
        // from a prior upload while the new extraction is in flight.
        extractedText: null,
        extractionStatus: "pending",
        uploadVersion,
        updatedAt: now,
      })
      .where(eq(dealDocumentsTable.id, id))
      .returning();

    // Fire-and-forget text extraction — does not block the HTTP response.
    // The conditional UPDATE uses uploadVersion to guard against stale writes.
    scheduleExtraction({
      documentId: id,
      expectedUploadVersion: uploadVersion,
      documentType: doc.documentType,
      classification: doc.classification,
      fileBuffer: req.file.buffer,
      fileMime: req.file.mimetype,
      logFn: (err) => req.log.error({ err, documentId: id }, "Text extraction failed after upload"),
    });

    return res.json(formatDoc(updated));
  } catch (err) {
    req.log.error({ err }, "Storage error uploading file");
    return res.status(500).json({ error: "File upload failed. Please try again." });
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
      missingSecrets: ["DEFAULT_OBJECT_STORAGE_BUCKET_ID"],
    });
  }

  if (!req.file) return res.status(400).json({ error: "No file provided" });

  const [doc] = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.id, id))
    .limit(1);

  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (!(await canAccessTarget(req, doc.targetId))) return res.status(404).json({ error: "Document not found" });

  const previousStoragePath = doc.storagePath ?? null;

  try {
    const { storagePath } = await uploadFile({
      targetId: doc.targetId,
      documentId: doc.id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
    });

    // Fresh UUID per replacement — storage paths are deterministic so this
    // is the only reliable way to distinguish one replacement from the next.
    const uploadVersion = randomUUID();
    const now = new Date();
    const [updated] = await db
      .update(dealDocumentsTable)
      .set({
        storagePath,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: now,
        // Reset extraction state atomically — no stale content from the old
        // file persists to the new version while extraction is in flight.
        extractedText: null,
        extractionStatus: "pending",
        uploadVersion,
        updatedAt: now,
      })
      .where(eq(dealDocumentsTable.id, id))
      .returning();

    // Delete the old object only after DB is committed so we never lose both
    if (previousStoragePath && previousStoragePath !== storagePath) {
      deleteFile(previousStoragePath).catch(() => {
        // Non-fatal: old object becomes orphaned but DB is already consistent
      });
    }

    // Fire-and-forget text extraction — does not block the HTTP response.
    // Re-checks eligibility on replacement; uses uploadVersion to guard stale writes.
    scheduleExtraction({
      documentId: id,
      expectedUploadVersion: uploadVersion,
      documentType: doc.documentType,
      classification: doc.classification,
      fileBuffer: req.file.buffer,
      fileMime: req.file.mimetype,
      logFn: (err) => req.log.error({ err, documentId: id }, "Text extraction failed after file replace"),
    });

    return res.json(formatDoc(updated));
  } catch (err) {
    req.log.error({ err }, "Storage error replacing file");
    return res.status(500).json({ error: "File replacement failed. Please try again." });
  }
});

// ─── PUT /api/documents/:id ──────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [existing] = await db.select().from(dealDocumentsTable).where(eq(dealDocumentsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!(await canAccessTarget(req, existing.targetId))) return res.status(404).json({ error: "Not found" });
  const parsed = UpdateDocSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();

  // Whenever the resulting metadata makes the document ineligible for extraction
  // (wrong type or Highly-Restricted), unconditionally clear any stored plaintext.
  // This covers both transitions from eligible→ineligible and the edge case where
  // the document was already ineligible but a stale background callback may have
  // written text since the last metadata update.
  const newDocType = d.documentType !== undefined ? d.documentType : existing.documentType;
  const newClassification = d.classification !== undefined ? d.classification : existing.classification;
  const nowEligible = shouldExtract(newDocType, newClassification);
  const extractionClearFields = !nowEligible
    ? { extractedText: null as string | null, extractionStatus: "unsupported" }
    : {};

  const [doc] = await db
    .update(dealDocumentsTable)
    .set({
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(d.documentType !== undefined ? { documentType: d.documentType } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.classification !== undefined ? { classification: d.classification } : {}),
      ...(d.owner !== undefined ? { owner: d.owner } : {}),
      ...(d.documentDate !== undefined ? { documentDate: d.documentDate ?? null } : {}),
      ...(d.url !== undefined ? { url: d.url ?? null } : {}),
      ...(d.workstream !== undefined ? { workstream: d.workstream ?? null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes ?? null } : {}),
      ...extractionClearFields,
      updatedAt: now,
    })
    .where(eq(dealDocumentsTable.id, id))
    .returning();

  if (!doc) return res.status(404).json({ error: "Not found" });
  return res.json(formatDoc(doc));
});

// ─── Multer error handler ────────────────────────────────────────────────────
// Must be placed after all upload routes so multer validation errors (MIME type
// rejected, file too large) return 400/413 instead of falling through to the
// global 500 error handler.
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err && typeof err === "object" && "code" in err) {
    const multerErr = err as { code: string; message: string };
    if (multerErr.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
      });
    }
    if (multerErr.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: "Unexpected file field." });
    }
  }
  if (err instanceof Error && err.message.startsWith("File type not allowed:")) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

export default router;
