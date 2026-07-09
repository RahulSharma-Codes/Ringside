import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { dealSponsorsTable } from "@workspace/db";
import { z } from "zod";
import { canAccessTarget } from "../lib/target-access";

const router = Router();

const UpdateSponsorBodySchema = z.object({
  name: z.string().min(1).optional(),
  roleTitle: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// PUT /api/sponsors/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [existing] = await db.select().from(dealSponsorsTable).where(eq(dealSponsorsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Sponsor not found" });
  if (!(await canAccessTarget(req, existing.targetId))) return res.status(404).json({ error: "Sponsor not found" });
  const parsed = UpdateSponsorBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db
    .update(dealSponsorsTable)
    .set(parsed.data)
    .where(eq(dealSponsorsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Sponsor not found" });
  return res.json(updated);
});

// DELETE /api/sponsors/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [existing] = await db.select().from(dealSponsorsTable).where(eq(dealSponsorsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Sponsor not found" });
  if (!(await canAccessTarget(req, existing.targetId))) return res.status(404).json({ error: "Sponsor not found" });
  const [deleted] = await db
    .delete(dealSponsorsTable)
    .where(eq(dealSponsorsTable.id, id))
    .returning();
  if (!deleted) return res.status(404).json({ error: "Sponsor not found" });
  return res.status(204).end();
});

export default router;
