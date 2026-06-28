import { Router } from "express";
import { eq, inArray, and, or, gte, isNotNull, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { actionItemsTable, targetsTable, milestonesTable } from "@workspace/db";
import { UpdateActionBody } from "@workspace/api-zod";
import { writeAuditEvent } from "./audit";

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

// GET /api/actions/open — only regular actions (workstream IS NULL)
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
      workstream: actionItemsTable.workstream,
      notes: actionItemsTable.notes,
      targetName: targetsTable.projectName,
    })
    .from(actionItemsTable)
    .innerJoin(targetsTable, eq(actionItemsTable.targetId, targetsTable.id))
    .where(
      and(
        isNull(actionItemsTable.workstream),
        inArray(actionItemsTable.status, ["Open", "In Progress", "Blocked"]),
      ),
    );

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
// Returns open/blocked/in-progress regular actions + recently completed (last 14 days).
// Excludes diligence items (workstream IS NOT NULL) — those appear in the Diligence tab.
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
      workstream: actionItemsTable.workstream,
      notes: actionItemsTable.notes,
      targetName: targetsTable.projectName,
      targetCode: targetsTable.targetCode,
      priorityTier: targetsTable.priorityTier,
      currentStage: milestonesTable.currentStage,
    })
    .from(actionItemsTable)
    .leftJoin(targetsTable, eq(actionItemsTable.targetId, targetsTable.id))
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, actionItemsTable.targetId))
    .where(
      and(
        isNull(actionItemsTable.workstream),
        or(
          inArray(actionItemsTable.status, ["Open", "In Progress", "Blocked"]),
          and(
            eq(actionItemsTable.status, "Completed"),
            isNotNull(actionItemsTable.completedAt),
            gte(actionItemsTable.completedAt, fourteenDaysAgo),
          ),
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

// PUT /api/actions/:id — handles both regular actions and diligence items
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
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
  if (d.workstream !== undefined) updates.workstream = d.workstream;
  if (d.notes !== undefined) updates.notes = d.notes;
  if (d.evidenceLinks !== undefined) updates.evidenceLinks = d.evidenceLinks ?? null;

  const [prevAction] = await db
    .select({ status: actionItemsTable.status, workstream: actionItemsTable.workstream, description: actionItemsTable.description, targetId: actionItemsTable.targetId })
    .from(actionItemsTable)
    .where(eq(actionItemsTable.id, id));

  const [action] = await db
    .update(actionItemsTable)
    .set(updates)
    .where(eq(actionItemsTable.id, id))
    .returning();

  if (!action) return res.status(404).json({ error: "Not found" });

  if (d.status === "Completed" && prevAction && prevAction.status !== "Completed") {
    const eventType = prevAction.workstream ? "diligence_item_completed" : "action_completed";
    await writeAuditEvent(eventType, action.targetId, null, {
      actionId: action.id,
      description: action.description,
      ...(action.workstream && { workstream: action.workstream }),
    });
  }

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
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(actionItemsTable).where(eq(actionItemsTable.id, id));
  return res.status(204).send();
});

export default router;
