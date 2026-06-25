import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { synergiesTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const SYNERGY_TYPES = ["Revenue", "Cost", "Capital", "Tax"] as const;
const SYNERGY_CONFIDENCES = ["Probable", "Possible", "Aspirational"] as const;
const SYNERGY_STATUSES = ["Not Started", "On Track", "Slipping", "Realised"] as const;

const UpdateSynergyBodySchema = z.object({
  type: z.enum(SYNERGY_TYPES).optional(),
  description: z.string().min(1).optional(),
  fy1: z.number().nullable().optional(),
  fy2: z.number().nullable().optional(),
  fy3: z.number().nullable().optional(),
  fy4: z.number().nullable().optional(),
  fy5: z.number().nullable().optional(),
  oneTimeCost: z.number().nullable().optional(),
  confidence: z.enum(SYNERGY_CONFIDENCES).optional(),
  ownerName: z.string().nullable().optional(),
  realisationStartMonth: z.string().nullable().optional(),
  realisationStatus: z.enum(SYNERGY_STATUSES).nullable().optional(),
  isDisynergy: z.boolean().optional(),
});

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function formatSynergy(s: typeof synergiesTable.$inferSelect) {
  return {
    ...s,
    createdAt: toIso(s.createdAt),
    updatedAt: toIso(s.updatedAt),
  };
}

// PUT /api/synergies/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = UpdateSynergyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();

  const updates: Partial<typeof synergiesTable.$inferInsert> = { updatedAt: now };
  if (d.type !== undefined) updates.type = d.type;
  if (d.description !== undefined) updates.description = d.description;
  if (d.fy1 !== undefined) updates.fy1 = d.fy1;
  if (d.fy2 !== undefined) updates.fy2 = d.fy2;
  if (d.fy3 !== undefined) updates.fy3 = d.fy3;
  if (d.fy4 !== undefined) updates.fy4 = d.fy4;
  if (d.fy5 !== undefined) updates.fy5 = d.fy5;
  if (d.oneTimeCost !== undefined) updates.oneTimeCost = d.oneTimeCost;
  if (d.confidence !== undefined) updates.confidence = d.confidence;
  if (d.ownerName !== undefined) updates.ownerName = d.ownerName;
  if (d.realisationStartMonth !== undefined) updates.realisationStartMonth = d.realisationStartMonth;
  if (d.realisationStatus !== undefined) updates.realisationStatus = d.realisationStatus ?? "Not Started";
  if (d.isDisynergy !== undefined) updates.isDisynergy = d.isDisynergy;

  const [row] = await db
    .update(synergiesTable)
    .set(updates)
    .where(eq(synergiesTable.id, id))
    .returning();

  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(formatSynergy(row));
});

// DELETE /api/synergies/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(synergiesTable).where(eq(synergiesTable.id, id));
  return res.status(204).send();
});

export default router;
