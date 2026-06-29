import { Router, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { interactionsTable, targetsTable } from "@workspace/db";
import { CreateInteractionBody } from "@workspace/api-zod";

const router = Router({ mergeParams: true });

type InteractionRow = typeof interactionsTable.$inferSelect;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function formatInteraction(i: InteractionRow) {
  return {
    ...i,
    interactionDatetime: toIso(i.interactionDatetime),
    createdAt: toIso(i.createdAt),
  };
}

// GET /api/targets/:id/interactions
router.get("/", async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  const interactions = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.targetId, id))
    .orderBy(desc(interactionsTable.interactionDatetime));

  return res.json(interactions.map(formatInteraction));
});

// POST /api/targets/:id/interactions
router.post("/", async (req, res) => {
  const targetId = parseInt((req.params as { id: string }).id, 10);
  const parsed = CreateInteractionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();
  const [interaction] = await db
    .insert(interactionsTable)
    .values({
      targetId,
      interactionType: d.interactionType,
      summary: d.summary,
      participantsInternal: d.participantsInternal ?? null,
      participantsExternal: d.participantsExternal ?? null,
      sentiment: d.sentiment ?? null,
      promoterWillingness: d.promoterWillingness ?? null,
      valuationSignal: d.valuationSignal ?? null,
      createdBy: d.createdBy ?? null,
      interactionDatetime: d.interactionDatetime ? new Date(d.interactionDatetime) : now,
      createdAt: now,
    })
    .returning();

  await db
    .update(targetsTable)
    .set({ updatedAt: now })
    .where(eq(targetsTable.id, targetId));

  return res.status(201).json(formatInteraction(interaction));
});

export default router;
