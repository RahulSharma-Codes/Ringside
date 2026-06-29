import { Router, type Request, type Response } from "express";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { actionItemsTable, targetsTable } from "@workspace/db";
import { CreateActionBody } from "@workspace/api-zod";
import { writeAuditEvent } from "./audit";

const router = Router({ mergeParams: true });

type ActionRow = typeof actionItemsTable.$inferSelect;

function toDateString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function formatAction(a: ActionRow) {
  return {
    ...a,
    dueDate: toDateString(a.dueDate),
    createdAt: toIso(a.createdAt),
    completedAt: toIso(a.completedAt),
  };
}

// GET /api/targets/:id/actions — regular actions only (workstream IS NULL)
router.get("/", async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  const actions = await db
    .select()
    .from(actionItemsTable)
    .where(and(eq(actionItemsTable.targetId, id), isNull(actionItemsTable.workstream)))
    .orderBy(desc(actionItemsTable.createdAt));

  return res.json(actions.map(formatAction));
});

// POST /api/targets/:id/actions
router.post("/", async (req, res) => {
  const targetId = parseInt((req.params as { id: string }).id, 10);
  const parsed = CreateActionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();
  const [action] = await db
    .insert(actionItemsTable)
    .values({
      targetId,
      interactionId: d.interactionId ?? null,
      description: d.description,
      owner: d.owner ?? null,
      dueDate: d.dueDate ? d.dueDate.toISOString().split("T")[0] : null,
      priority: d.priority ?? "Medium",
      status: "Open",
      workstream: null,
      notes: d.notes ?? null,
      createdAt: now,
    })
    .returning();

  await db
    .update(targetsTable)
    .set({ updatedAt: now })
    .where(eq(targetsTable.id, targetId));

  await writeAuditEvent("action_created", targetId, d.owner ?? null, {
    actionId: action.id,
    description: action.description,
    priority: action.priority,
  });

  return res.status(201).json(formatAction(action));
});

export default router;
