import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { regulatoryClearancesTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const CLEARANCE_STATUSES = ["Not Required", "Pending", "Filed", "Cleared", "Blocked"] as const;

const UpdateClearanceBodySchema = z.object({
  category: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  status: z.enum(CLEARANCE_STATUSES).optional(),
  targetClearanceDate: z.string().nullable().optional(),
  evidenceReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// PUT /api/regulatory-clearances/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = UpdateClearanceBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const now = new Date();
  const [updated] = await db
    .update(regulatoryClearancesTable)
    .set({ ...parsed.data, updatedAt: now })
    .where(eq(regulatoryClearancesTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Clearance not found" });
  return res.json(updated);
});

// DELETE /api/regulatory-clearances/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [deleted] = await db
    .delete(regulatoryClearancesTable)
    .where(eq(regulatoryClearancesTable.id, id))
    .returning();
  if (!deleted) return res.status(404).json({ error: "Clearance not found" });
  return res.status(204).end();
});

export default router;
