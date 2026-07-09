import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { interactionsTable } from "@workspace/db";
import { UpdateInteractionBody } from "@workspace/api-zod";
import { canAccessTarget } from "../lib/target-access";

const router = Router();

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

// PUT /api/interactions/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = UpdateInteractionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const d = parsed.data;
  const updates: Partial<typeof interactionsTable.$inferInsert> = {};
  if (d.interactionType != null) updates.interactionType = d.interactionType;
  if (d.summary != null) updates.summary = d.summary;
  if (d.participantsInternal !== undefined) updates.participantsInternal = d.participantsInternal ?? null;
  if (d.participantsExternal !== undefined) updates.participantsExternal = d.participantsExternal ?? null;
  if (d.sentiment !== undefined) updates.sentiment = d.sentiment ?? null;
  if (d.promoterWillingness !== undefined) updates.promoterWillingness = d.promoterWillingness ?? null;
  if (d.valuationSignal !== undefined) updates.valuationSignal = d.valuationSignal ?? null;
  if (d.interactionDatetime != null) {
    updates.interactionDatetime = new Date(d.interactionDatetime);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const [existing] = await db
    .select({ targetId: interactionsTable.targetId })
    .from(interactionsTable)
    .where(eq(interactionsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!(await canAccessTarget(req, existing.targetId))) {
    return res.status(404).json({ error: "Not found" });
  }

  const [interaction] = await db
    .update(interactionsTable)
    .set(updates)
    .where(eq(interactionsTable.id, id))
    .returning();

  if (!interaction) return res.status(404).json({ error: "Not found" });

  return res.json({
    ...interaction,
    interactionDatetime: toIso(interaction.interactionDatetime),
    createdAt: toIso(interaction.createdAt),
  });
});

// DELETE /api/interactions/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db
    .select({ targetId: interactionsTable.targetId })
    .from(interactionsTable)
    .where(eq(interactionsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!(await canAccessTarget(req, existing.targetId))) {
    return res.status(404).json({ error: "Not found" });
  }

  await db.delete(interactionsTable).where(eq(interactionsTable.id, id));
  return res.status(204).send();
});

export default router;
