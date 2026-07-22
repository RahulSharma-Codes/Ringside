import { Router } from "express";
import { eq, desc, and, isNull, lte, gte, ne, isNotNull, not, sql, inArray, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  notificationsTable,
  targetsTable,
  milestonesTable,
  actionItemsTable,
  interactionsTable,
  stageChangeLogTable,
  ndaRecordsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { getAccessScope } from "../lib/target-access";

function requireAuthScope(scope: Awaited<ReturnType<typeof getAccessScope>>) {
  return !scope.userId;
}

const router = Router();

// ── Deduplication key helper ───────────────────────────────────────────────────
// Prevents inserting the same notification type+target combo within 24h
async function alreadyExists(type: string, targetId: number | null): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const conditions = [
    eq(notificationsTable.type, type),
    gte(notificationsTable.createdAt, since),
  ];
  if (targetId !== null) conditions.push(eq(notificationsTable.targetId, targetId));
  else conditions.push(isNull(notificationsTable.targetId));

  const [row] = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(and(...conditions))
    .limit(1);
  return !!row;
}

// ── POST /api/notifications/generate ──────────────────────────────────────────
router.post("/generate", requireRole("Admin"), async (req, res) => {
  const scope = await getAccessScope(req);
  if (requireAuthScope(scope)) return res.status(401).json({ error: "Authentication required" });
  if (!scope.isAdmin) return res.status(403).json({ error: "Admin access required" });

  const now = new Date();
  const inserted: string[] = [];

  // ── 1. Stage stagnation: current stage > 45 days, needsAttention flag ───────
  // Query all active targets with stage milestone data (compute stagnation from stageEnteredAt)
  const threshold45 = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const stagnantTargets = await db
    .select({
      id: targetsTable.id,
      projectName: targetsTable.projectName,
      targetCode: targetsTable.targetCode,
      currentStage: milestonesTable.currentStage,
      stageEnteredAt: milestonesTable.stageEnteredAt,
    })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(
      and(
        eq(targetsTable.isActive, true),
        isNotNull(milestonesTable.stageEnteredAt),
        lte(milestonesTable.stageEnteredAt, threshold45),
      )
    );

  for (const t of stagnantTargets) {
    if (!t.stageEnteredAt) continue;
    const days = Math.floor((now.getTime() - new Date(t.stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24));
    if (await alreadyExists("stage_stagnation", t.id)) continue;
    await db.insert(notificationsTable).values({
      targetId: t.id,
      type: "stage_stagnation",
      title: "Deal stagnating in stage",
      body: `${t.projectName ?? t.targetCode} has been in "${t.currentStage}" for ${days} days with no progression.`,
      linkPath: `/targets/${t.id}`,
    });
    inserted.push(`stage_stagnation:${t.id}`);
  }

  // ── 2. Action overdue ────────────────────────────────────────────────────────
  const overdueActions = await db
    .select({
      id: actionItemsTable.id,
      targetId: actionItemsTable.targetId,
      description: actionItemsTable.description,
      dueDate: actionItemsTable.dueDate,
      projectName: targetsTable.projectName,
      targetCode: targetsTable.targetCode,
    })
    .from(actionItemsTable)
    .leftJoin(targetsTable, eq(targetsTable.id, actionItemsTable.targetId))
    .where(
      and(
        eq(actionItemsTable.status, "Open"),
        isNotNull(actionItemsTable.dueDate),
        lte(actionItemsTable.dueDate, now.toISOString().slice(0, 10)),
        isNull(actionItemsTable.workstream),
      )
    )
    .limit(20);

  for (const a of overdueActions) {
    if (!a.targetId) continue;
    const notifType = `action_overdue_${a.id}`;
    if (await alreadyExists(notifType, a.targetId)) continue;
    await db.insert(notificationsTable).values({
      targetId: a.targetId,
      type: notifType,
      title: "Action overdue",
      body: `"${a.description}" on ${a.projectName ?? a.targetCode} was due ${a.dueDate} and is still open.`,
      linkPath: `/targets/${a.targetId}?tab=actions`,
    });
    inserted.push(`action_overdue:${a.id}`);
  }

  // ── 3. NDA expiring within 30 days ──────────────────────────────────────────
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const expiringNdas = await db
    .select({
      id: ndaRecordsTable.id,
      targetId: ndaRecordsTable.targetId,
      counterparty: ndaRecordsTable.counterparty,
      expiryDate: ndaRecordsTable.expiryDate,
      projectName: targetsTable.projectName,
      targetCode: targetsTable.targetCode,
    })
    .from(ndaRecordsTable)
    .leftJoin(targetsTable, eq(targetsTable.id, ndaRecordsTable.targetId))
    .where(
      and(
        eq(ndaRecordsTable.status, "Active"),
        isNotNull(ndaRecordsTable.expiryDate),
        lte(ndaRecordsTable.expiryDate, in30Days),
        gte(ndaRecordsTable.expiryDate, now.toISOString().slice(0, 10)),
      )
    );

  for (const n of expiringNdas) {
    if (!n.targetId) continue;
    const notifType = `nda_expiring_${n.id}`;
    if (await alreadyExists(notifType, n.targetId)) continue;
    await db.insert(notificationsTable).values({
      targetId: n.targetId,
      type: notifType,
      title: "NDA expiring soon",
      body: `NDA with ${n.counterparty ?? "counterparty"} on ${n.projectName ?? n.targetCode} expires ${n.expiryDate}.`,
      linkPath: `/targets/${n.targetId}?tab=compliance`,
    });
    inserted.push(`nda_expiring:${n.id}`);
  }

  // ── 4. Must-win no interaction in 14 days ────────────────────────────────────
  const mustWins = await db
    .select({
      id: targetsTable.id,
      projectName: targetsTable.projectName,
      targetCode: targetsTable.targetCode,
    })
    .from(targetsTable)
    .where(
      and(
        eq(targetsTable.isActive, true),
        eq(targetsTable.priorityTier, "Must-Win"),
      )
    );

  for (const t of mustWins) {
    const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const [lastInteraction] = await db
      .select({ id: interactionsTable.id, date: interactionsTable.interactionDatetime })
      .from(interactionsTable)
      .where(
        and(
          eq(interactionsTable.targetId, t.id),
          gte(interactionsTable.interactionDatetime, since14),
        )
      )
      .limit(1);

    if (lastInteraction) continue;
    if (await alreadyExists("must_win_no_activity", t.id)) continue;
    await db.insert(notificationsTable).values({
      targetId: t.id,
      type: "must_win_no_activity",
      title: "Must-Win: no interaction in 14 days",
      body: `${t.projectName ?? t.targetCode} is a Must-Win deal with no logged interaction in 14+ days.`,
      linkPath: `/targets/${t.id}`,
    });
    inserted.push(`must_win_no_activity:${t.id}`);
  }

  // ── Count unread after generation ────────────────────────────────────────────
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(eq(notificationsTable.isRead, false));

  return res.json({ inserted: inserted.length, unreadCount: Number(count) });
});

// ── GET /api/notifications ─────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const scope = await getAccessScope(req);
  if (requireAuthScope(scope)) return res.status(401).json({ error: "Authentication required" });
  const visibilityFilter = scope.isAdmin
    ? undefined
    : or(isNull(notificationsTable.targetId), inArray(notificationsTable.targetId, scope.accessibleTargetIds));

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(visibilityFilter)
    .orderBy(notificationsTable.isRead, desc(notificationsTable.createdAt))
    .limit(50);
  return res.json(rows);
});

// ── GET /api/notifications/unread-count ───────────────────────────────────────
router.get("/unread-count", async (req, res) => {
  const scope = await getAccessScope(req);
  if (requireAuthScope(scope)) return res.status(401).json({ error: "Authentication required" });
  const visibilityFilter = scope.isAdmin
    ? eq(notificationsTable.isRead, false)
    : and(
        eq(notificationsTable.isRead, false),
        or(isNull(notificationsTable.targetId), inArray(notificationsTable.targetId, scope.accessibleTargetIds)),
      );

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(visibilityFilter);
  return res.json({ count: Number(count) });
});

// ── PUT /api/notifications/:id/read ───────────────────────────────────────────
router.put("/:id/read", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const scope = await getAccessScope(req);
  if (requireAuthScope(scope)) return res.status(401).json({ error: "Authentication required" });
  const [existing] = await db
    .select({ id: notificationsTable.id, targetId: notificationsTable.targetId })
    .from(notificationsTable)
    .where(eq(notificationsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!scope.isAdmin && existing.targetId !== null && !scope.accessibleTargetIds.includes(existing.targetId)) {
    return res.status(404).json({ error: "Not found" });
  }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, id));
  return res.json({ ok: true });
});

// ── PUT /api/notifications/read-all ───────────────────────────────────────────
router.put("/read-all", async (req, res) => {
  const scope = await getAccessScope(req);
  if (requireAuthScope(scope)) return res.status(401).json({ error: "Authentication required" });
  const visibilityFilter = scope.isAdmin
    ? eq(notificationsTable.isRead, false)
    : and(
        eq(notificationsTable.isRead, false),
        or(isNull(notificationsTable.targetId), inArray(notificationsTable.targetId, scope.accessibleTargetIds)),
      );

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(visibilityFilter);
  return res.json({ ok: true });
});

export default router;
