import { Router } from "express";
import { eq, and, inArray, gte, desc, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  interactionsTable,
  actionItemsTable,
  stageChangeLogTable,
} from "@workspace/db";

const router = Router();

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
}

function toDateString(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// GET /api/review/weekly
// Read-only. No schema changes. Uses existing tables only.
// Limitations (per Phase 4A guardrails):
//   - "Recently updated" uses targets.updatedAt which reflects the last PUT /targets/:id call.
//   - "No recent interaction" guardrail: newly created targets (<30d) are never flagged.
//   - "Recently completed" actions use completedAt; rows completed before that field was
//     populated (completedAt IS NULL) are omitted from that bucket.
router.get("/weekly", async (_req, res) => {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const todayStr = today.toISOString().slice(0, 10);
  const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sevenDaysLaterStr = sevenDaysLater.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fortyFiveDaysAgo = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000);

  // ── Batch all DB reads in parallel ──────────────────────────────────────
  const [targetsWithMilestones, allOpenActions, allInteractions, recentStageChangesRaw] =
    await Promise.all([
      // Active targets + milestone (for currentStage / stageEnteredAt)
      db
        .select({
          id: targetsTable.id,
          targetCode: targetsTable.targetCode,
          projectName: targetsTable.projectName,
          priorityTier: targetsTable.priorityTier,
          isActive: targetsTable.isActive,
          createdAt: targetsTable.createdAt,
          updatedAt: targetsTable.updatedAt,
          currentStage: milestonesTable.currentStage,
          stageEnteredAt: milestonesTable.stageEnteredAt,
        })
        .from(targetsTable)
        .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
        .where(eq(targetsTable.isActive, true)),

      // All open/in-progress/blocked actions with enriched target fields
      db
        .select({
          id: actionItemsTable.id,
          targetId: actionItemsTable.targetId,
          description: actionItemsTable.description,
          owner: actionItemsTable.owner,
          dueDate: actionItemsTable.dueDate,
          priority: actionItemsTable.priority,
          status: actionItemsTable.status,
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
            inArray(actionItemsTable.status, ["Open", "In Progress", "Blocked"]),
            isNull(actionItemsTable.workstream),
          ),
        ),

      // All interactions — only targetId + datetime for recency checks
      db
        .select({
          targetId: interactionsTable.targetId,
          interactionDatetime: interactionsTable.interactionDatetime,
        })
        .from(interactionsTable),

      // Stage changes from last 7 days
      db
        .select({
          id: stageChangeLogTable.id,
          targetId: stageChangeLogTable.targetId,
          previousStage: stageChangeLogTable.previousStage,
          newStage: stageChangeLogTable.newStage,
          changedBy: stageChangeLogTable.changedBy,
          changedAt: stageChangeLogTable.changedAt,
          targetName: targetsTable.projectName,
          targetCode: targetsTable.targetCode,
          priorityTier: targetsTable.priorityTier,
        })
        .from(stageChangeLogTable)
        .leftJoin(targetsTable, eq(stageChangeLogTable.targetId, targetsTable.id))
        .where(gte(stageChangeLogTable.changedAt, sevenDaysAgo))
        .orderBy(desc(stageChangeLogTable.changedAt)),
    ]);

  // ── Build lookup maps ────────────────────────────────────────────────────
  const openActionCountByTarget = new Map<number, number>();
  for (const a of allOpenActions) {
    openActionCountByTarget.set(a.targetId, (openActionCountByTarget.get(a.targetId) ?? 0) + 1);
  }

  const lastInteractionByTarget = new Map<number, Date>();
  for (const i of allInteractions) {
    const d = new Date(i.interactionDatetime);
    const existing = lastInteractionByTarget.get(i.targetId);
    if (!existing || d > existing) lastInteractionByTarget.set(i.targetId, d);
  }

  // ── Format helpers ────────────────────────────────────────────────────────
  type TargetRow = (typeof targetsWithMilestones)[number];
  type ActionRow = (typeof allOpenActions)[number];

  const fmtTarget = (t: TargetRow, extra?: Record<string, unknown>) => ({
    id: t.id,
    targetCode: t.targetCode,
    projectName: t.projectName,
    priorityTier: t.priorityTier,
    currentStage: t.currentStage ?? "Sourcing",
    openActionCount: openActionCountByTarget.get(t.id) ?? 0,
    lastInteractionDate: toIso(lastInteractionByTarget.get(t.id) ?? null),
    ...extra,
  });

  const fmtAction = (a: ActionRow) => ({
    id: a.id,
    targetId: a.targetId,
    description: a.description,
    owner: a.owner,
    dueDate: toDateString(a.dueDate),
    priority: a.priority,
    status: a.status,
    targetName: a.targetName ?? `Target #${a.targetId}`,
    targetCode: a.targetCode ?? null,
    priorityTier: a.priorityTier ?? null,
    currentStage: a.currentStage ?? "Unknown",
  });

  // ── 1. Must-Win opportunities ────────────────────────────────────────────
  const mustWin = targetsWithMilestones
    .filter((t) => t.priorityTier === "Must-Win")
    .map((t) => fmtTarget(t));

  // ── 2. Needs Attention ───────────────────────────────────────────────────
  const needsAttention = targetsWithMilestones
    .filter((t) => {
      const openCount = openActionCountByTarget.get(t.id) ?? 0;
      const lastInteraction = lastInteractionByTarget.get(t.id);
      const createdAt = t.createdAt ? new Date(t.createdAt) : null;

      if (allOpenActions.some((a) => a.targetId === t.id && a.dueDate && new Date(a.dueDate) < today)) {
        return true;
      }
      if (t.priorityTier === "Must-Win" && openCount === 0) return true;

      // No recent interaction guardrail (per Phase 4A spec):
      // Only flag if created > 30d ago OR latest interaction > 30d ago.
      if (!lastInteraction) {
        if (createdAt && createdAt < thirtyDaysAgo) return true;
      } else if (lastInteraction < thirtyDaysAgo) {
        return true;
      }

      const stageDate = t.stageEnteredAt ? new Date(t.stageEnteredAt) : null;
      if (stageDate && stageDate < fortyFiveDaysAgo) return true;

      return false;
    })
    .map((t) => fmtTarget(t));

  // ── 3. Overdue actions ───────────────────────────────────────────────────
  const overdueActions = allOpenActions
    .filter((a) => {
      const d = toDateString(a.dueDate);
      return d !== null && d < todayStr;
    })
    .map(fmtAction);

  // ── 4. Due this week ─────────────────────────────────────────────────────
  const dueThisWeek = allOpenActions
    .filter((a) => {
      const d = toDateString(a.dueDate);
      return d !== null && d >= todayStr && d <= sevenDaysLaterStr;
    })
    .map(fmtAction);

  // ── 5. Recent stage changes (last 7 days) ────────────────────────────────
  const recentStageChanges = recentStageChangesRaw.map((s) => ({
    id: s.id,
    targetId: s.targetId,
    targetName: s.targetName ?? `Target #${s.targetId}`,
    targetCode: s.targetCode ?? null,
    priorityTier: s.priorityTier ?? null,
    previousStage: s.previousStage,
    newStage: s.newStage,
    changedBy: s.changedBy,
    changedAt: toIso(s.changedAt),
  }));

  // ── 6. Recently updated targets (last 7 days via updatedAt) ─────────────
  // Limitation: updatedAt reflects the last PUT /targets/:id write, not field-level changes.
  const recentlyUpdated = targetsWithMilestones
    .filter((t) => t.updatedAt && new Date(t.updatedAt) >= sevenDaysAgo)
    .map((t) => fmtTarget(t, { updatedAt: toIso(t.updatedAt) }));

  // ── 7. Targets with no open action ──────────────────────────────────────
  const noOpenAction = targetsWithMilestones
    .filter((t) => (openActionCountByTarget.get(t.id) ?? 0) === 0)
    .map((t) => fmtTarget(t));

  // ── 8. No recent interaction ─────────────────────────────────────────────
  // Guardrail: newly created targets (<30d) are never flagged even without interactions.
  const noRecentInteraction = targetsWithMilestones
    .filter((t) => {
      const lastInteraction = lastInteractionByTarget.get(t.id);
      const createdAt = t.createdAt ? new Date(t.createdAt) : null;
      if (!lastInteraction) {
        return createdAt ? createdAt < thirtyDaysAgo : false;
      }
      return lastInteraction < thirtyDaysAgo;
    })
    .map((t) => fmtTarget(t));

  return res.json({
    mustWin,
    needsAttention,
    overdueActions,
    dueThisWeek,
    recentStageChanges,
    recentlyUpdated,
    noOpenAction,
    noRecentInteraction,
  });
});

export default router;
