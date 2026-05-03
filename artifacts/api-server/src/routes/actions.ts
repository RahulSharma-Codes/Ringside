import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { actionItemsTable, targetsTable } from "@workspace/db";
import { UpdateActionBody } from "@workspace/api-zod";

const router = Router();

// GET /api/actions/open
router.get("/open", async (_req, res) => {
  const actions = await db
    .select({
      id: actionItemsTable.id,
      targetId: actionItemsTable.targetId,
      interactionId: actionItemsTable.interactionId,
      description: actionItemsTable.description,
      owner: actionItemsTable.owner,
      dueDate: actionItemsTable.dueDate,
      priority: actionItemsTable.priority,
      status: actionItemsTable.status,
      createdAt: actionItemsTable.createdAt,
      completedAt: actionItemsTable.completedAt,
      targetName: targetsTable.projectName,
    })
    .from(actionItemsTable)
    .innerJoin(targetsTable, eq(actionItemsTable.targetId, targetsTable.id))
    .where(inArray(actionItemsTable.status, ["Open", "In Progress", "Blocked"]));

  return res.json(
    actions.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
  );
});

// PUT /api/actions/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const parsed = UpdateActionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const d = parsed.data;
  const updates: Partial<typeof actionItemsTable.$inferInsert> = {};
  if (d.description !== undefined) updates.description = d.description;
  if (d.owner !== undefined) updates.owner = d.owner;
  if (d.dueDate !== undefined) updates.dueDate = d.dueDate;
  if (d.priority !== undefined) updates.priority = d.priority;
  if (d.status !== undefined) {
    updates.status = d.status;
    if (d.status === "Completed") {
      updates.completedAt = new Date();
    }
  }

  const [action] = await db
    .update(actionItemsTable)
    .set(updates)
    .where(eq(actionItemsTable.id, id))
    .returning();

  if (!action) return res.status(404).json({ error: "Not found" });

  return res.json({
    ...action,
    createdAt: action.createdAt.toISOString(),
    completedAt: action.completedAt?.toISOString() ?? null,
  });
});

// DELETE /api/actions/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db.delete(actionItemsTable).where(eq(actionItemsTable.id, id));
  return res.status(204).send();
});

export default router;
