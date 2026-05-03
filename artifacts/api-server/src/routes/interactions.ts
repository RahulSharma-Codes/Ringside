import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { interactionsTable } from "@workspace/db";
import { UpdateInteractionBody } from "@workspace/api-zod";

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
  if (d.interactionType !== undefined) updates.interactionType = d.interactionType as string;
  if (d.summary !== undefined) updates.summary = d.summary as string;
  if (d.participantsInternal !== undefined) updates.participantsInternal = d.participantsInternal;
  if (d.participantsExternal !== undefined) updates.participantsExternal = d.participantsExternal;
  if (d.sentiment !== undefined) updates.sentiment = d.sentiment;
  if (d.promoterWillingness !== undefined) updates.promoterWillingness = d.promoterWillingness;
  if (d.valuationSignal !== undefined) updates.valuationSignal = d.valuationSignal;
  if (d.interactionDatetime !== undefined && d.interactionDatetime !== null) {
    updates.interactionDatetime = new Date(d.interactionDatetime);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
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

export default router;
