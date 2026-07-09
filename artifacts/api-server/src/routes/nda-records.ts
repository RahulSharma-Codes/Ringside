import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { ndaRecordsTable } from "@workspace/db";
import { z } from "zod";
import { canAccessTarget } from "../lib/target-access";

const router = Router();

const NDA_SCOPES = ["One-way", "Mutual"] as const;
const NDA_STATUSES = ["Active", "Expired", "Extended"] as const;

const UpdateNdaBodySchema = z.object({
  counterparty: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  scope: z.enum(NDA_SCOPES).optional(),
  termMonths: z.number().int().nullable().optional(),
  docReference: z.string().nullable().optional(),
  status: z.enum(NDA_STATUSES).optional(),
  notes: z.string().nullable().optional(),
});

// PUT /api/nda-records/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [existing] = await db.select().from(ndaRecordsTable).where(eq(ndaRecordsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "NDA record not found" });
  if (!(await canAccessTarget(req, existing.targetId))) return res.status(404).json({ error: "NDA record not found" });
  const parsed = UpdateNdaBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db
    .update(ndaRecordsTable)
    .set(parsed.data)
    .where(eq(ndaRecordsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "NDA record not found" });
  return res.json(updated);
});

// DELETE /api/nda-records/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [existing] = await db.select().from(ndaRecordsTable).where(eq(ndaRecordsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "NDA record not found" });
  if (!(await canAccessTarget(req, existing.targetId))) return res.status(404).json({ error: "NDA record not found" });
  const [deleted] = await db
    .delete(ndaRecordsTable)
    .where(eq(ndaRecordsTable.id, id))
    .returning();
  if (!deleted) return res.status(404).json({ error: "NDA record not found" });
  return res.status(204).end();
});

export default router;
