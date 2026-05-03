import { Router } from "express";
import { eq, inArray, and, or, gte, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { actionItemsTable, targetsTable, milestonesTable } from "@workspace/db";
import { UpdateActionBody } from "@workspace/api-zod";

const router = Router();

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
      dueDate: toDateString(a.dueDate),
      createdAt: toIso(a.createdAt),
      completedAt: toIso(a.completedAt),
    })),
  );
});

// GET /api/actions/command-center
// Returns open/blocked/in-progress actions + recently completed (last 14 days).
// "Recently completed" requires completedAt to be populated — set by PUT /:id when
// status → Completed. Rows completed before that write path existed (completedAt IS NULL)
// are excluded from the recently-completed bucket; this is by design, not a schema change.
router.get("/command-center", async (_req, res) => {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: actionItemsTable.id,
      targetId: actionItemsTable.targetId,
      description: actionItemsTable.description,
      owner: actionItemsTable.owner,
      dueDate: actionItemsTable.dueDate,
      priority: actionItemsTable.priority,
      status: actionItemsTable.status,
      createdAt: actionItemsTable.createdAt,
      completedAt: actionItemsTable.completedAt,
      targetName: targetsTable.projectName,
      targetCode: targetsTable.targetCode,
      priorityTier: targetsTable.priorityTier,
      currentStage: milestonesTable.currentStage,
    })
    .from(actionItemsTable)
    .leftJoin(targetsTable, eq(actionItemsTable.targetId, targetsTable.id))
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, actionItemsTable.targetId))
    .where(
      or(
        inArray(actionItemsTable.status, ["Open", "In Progress", "Blocked"]),
        and(
          eq(actionItemsTable.status, "Completed"),
          isNotNull(actionItemsTable.completedAt),
          gte(actionItemsTable.completedAt, fourteenDaysAgo),
        ),
      ),
    )
    .limit(200);

  return res.json(
    rows.map((a) => ({
      ...a,
      dueDate: toDateString(a.dueDate),
      createdAt: toIso(a.createdAt),
      completedAt: toIso(a.completedAt),
      currentStage: a.currentStage ?? "Unknown",
      targetName: a.targetName ?? `Target #${a.targetId}`,
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
  if (d.dueDate !== undefined) updates.dueDate = d.dueDate ? d.dueDate.toISOString().split("T")[0] : null;
  if (d.priority !== undefined) updates.priority = d.priority;
  if (d.status !== undefined) {
    updates.status = d.status;
    updates.completedAt = d.status === "Completed" ? new Date() : null;
  }

  const [action] = await db
    .update(actionItemsTable)
    .set(updates)
    .where(eq(actionItemsTable.id, id))
    .returning();

  if (!action) return res.status(404).json({ error: "Not found" });

  return res.json({
    ...action,
    dueDate: toDateString(action.dueDate),
    createdAt: toIso(action.createdAt),
    completedAt: toIso(action.completedAt),
  });
});

// DELETE /api/actions/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db.delete(actionItemsTable).where(eq(actionItemsTable.id, id));
  return res.status(204).send();
});

export default router;
