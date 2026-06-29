import { Router } from "express";
import { eq, and, inArray, gte, desc, isNull, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  interactionsTable,
  actionItemsTable,
  stageChangeLogTable,
} from "@workspace/db";
import { computeHealthScore } from "../lib/health-score";

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

// GET /api/review/weekly?dealType=<optional>
// Read-only. No schema changes. Uses existing tables only.
// Limitations (per Phase 4A guardrails):
//   - "Recently updated" uses targets.updatedAt which reflects the last PUT /targets/:id call.
//   - "No recent interaction" guardrail: newly created targets (<30d) are never flagged.
//   - "Recently completed" actions use completedAt; rows completed before that field was
//     populated (completedAt IS NULL) are omitted from that bucket.
router.get("/weekly", async (req, res) => {
  const dealType = (req.query.dealType as string | undefined) || undefined;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const todayStr = today.toISOString().slice(0, 10);
  const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sevenDaysLaterStr = sevenDaysLater.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fortyFiveDaysAgo = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000);

  // Build target WHERE conditions
  const targetConditions = [eq(targetsTable.isActive, true) as ReturnType<typeof eq>];
  if (dealType) targetConditions.push(eq(targetsTable.dealType, dealType));

  // ── Batch all DB reads in parallel ──────────────────────────────────────
  const [targetsWithMilestones, allOpenActions, allInteractions, recentStageChangesRaw, allDiligenceItems] =
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
          dealType: targetsTable.dealType,
          currentStage: milestonesTable.currentStage,
          stageEnteredAt: milestonesTable.stageEnteredAt,
        })
        .from(targetsTable)
        .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
        .where(and(...targetConditions)),

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
          dealType: targetsTable.dealType,
        })
        .from(actionItemsTable)
        .leftJoin(targetsTable, eq(actionItemsTable.targetId, targetsTable.id))
        .leftJoin(milestonesTable, eq(milestonesTable.targetId, actionItemsTable.targetId))
        .where(
          and(
            inArray(actionItemsTable.status, ["Open", "In Progress", "Blocked"]),
            isNull(actionItemsTable.workstream),
            ...(dealType ? [eq(targetsTable.dealType, dealType)] : []),
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
          dealType: targetsTable.dealType,
        })
        .from(stageChangeLogTable)
        .leftJoin(targetsTable, eq(stageChangeLogTable.targetId, targetsTable.id))
        .where(
          and(
            gte(stageChangeLogTable.changedAt, sevenDaysAgo),
            ...(dealType ? [eq(targetsTable.dealType, dealType)] : []),
          ),
        )
        .orderBy(desc(stageChangeLogTable.changedAt)),

      // Diligence items (actions with a workstream) for active targets
      db
        .select({
          targetId: actionItemsTable.targetId,
          status: actionItemsTable.status,
        })
        .from(actionItemsTable)
        .leftJoin(targetsTable, eq(actionItemsTable.targetId, targetsTable.id))
        .where(
          and(
            isNotNull(actionItemsTable.workstream),
            eq(targetsTable.isActive, true),
            ...(dealType ? [eq(targetsTable.dealType, dealType)] : []),
          ),
        ),
    ]);

  // ── Build lookup maps ────────────────────────────────────────────────────
  const openActionCountByTarget = new Map<number, number>();
  const overdueActionCountByTarget = new Map<number, number>();
  for (const a of allOpenActions) {
    openActionCountByTarget.set(a.targetId, (openActionCountByTarget.get(a.targetId) ?? 0) + 1);
    if (a.dueDate && new Date(a.dueDate) < today) {
      overdueActionCountByTarget.set(a.targetId, (overdueActionCountByTarget.get(a.targetId) ?? 0) + 1);
    }
  }

  const lastInteractionByTarget = new Map<number, Date>();
  for (const i of allInteractions) {
    const d = new Date(i.interactionDatetime);
    const existing = lastInteractionByTarget.get(i.targetId);
    if (!existing || d > existing) lastInteractionByTarget.set(i.targetId, d);
  }

  // Diligence stats per target (reused for health score + diligence health section)
  const diligenceStatsByTarget = new Map<number, { total: number; completed: number; blocked: number }>();
  for (const item of allDiligenceItems) {
    const s = diligenceStatsByTarget.get(item.targetId) ?? { total: 0, completed: 0, blocked: 0 };
    s.total++;
    if (item.status === "Completed") s.completed++;
    if (item.status === "Blocked") s.blocked++;
    diligenceStatsByTarget.set(item.targetId, s);
  }

  // Compute attention flags per target (used for needsAttention filter)
  const flagsByTarget = new Map<number, string[]>();
  for (const t of targetsWithMilestones) {
    const flags: string[] = [];
    const openCount = openActionCountByTarget.get(t.id) ?? 0;
    const lastInteraction = lastInteractionByTarget.get(t.id);
    const createdAt = t.createdAt ? new Date(t.createdAt) : null;

    if ((overdueActionCountByTarget.get(t.id) ?? 0) > 0) flags.push("overdue_action");
    if (t.priorityTier === "Must-Win" && openCount === 0) flags.push("must_win_no_action");
    if (!lastInteraction) {
      if (createdAt && createdAt < thirtyDaysAgo) flags.push("no_recent_interaction");
    } else if (lastInteraction < thirtyDaysAgo) {
      flags.push("no_recent_interaction");
    }
    const stageDate = t.stageEnteredAt ? new Date(t.stageEnteredAt) : null;
    if (stageDate && stageDate < fortyFiveDaysAgo) flags.push("stale_stage");
    flagsByTarget.set(t.id, flags);
  }

  // ── Format helpers ────────────────────────────────────────────────────────
  type TargetRow = (typeof targetsWithMilestones)[number];
  type ActionRow = (typeof allOpenActions)[number];

  const fmtTarget = (t: TargetRow, extra?: Record<string, unknown>) => {
    const lastInteraction = lastInteractionByTarget.get(t.id);
    const createdAt = t.createdAt ? new Date(t.createdAt) : null;
    const stageDate = t.stageEnteredAt ? new Date(t.stageEnteredAt) : null;
    const diligenceStats = diligenceStatsByTarget.get(t.id) ?? { total: 0, completed: 0, blocked: 0 };
    return {
      id: t.id,
      targetCode: t.targetCode,
      projectName: t.projectName,
      priorityTier: t.priorityTier,
      currentStage: t.currentStage ?? "Sourcing",
      openActionCount: openActionCountByTarget.get(t.id) ?? 0,
      lastInteractionDate: toIso(lastInteraction ?? null),
      healthScore: computeHealthScore({
        daysSinceLastInteraction: lastInteraction
          ? Math.floor((now.getTime() - lastInteraction.getTime()) / 86_400_000)
          : null,
        targetAgeInDays: createdAt
          ? Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000)
          : 0,
        openActionCount: openActionCountByTarget.get(t.id) ?? 0,
        overdueActionCount: overdueActionCountByTarget.get(t.id) ?? 0,
        diligenceTotalItems: diligenceStats.total,
        diligenceCompletedItems: diligenceStats.completed,
        daysInCurrentStage: stageDate
          ? Math.floor((now.getTime() - stageDate.getTime()) / 86_400_000)
          : null,
        currentStage: t.currentStage ?? "Sourcing",
      }),
      ...extra,
    };
  };

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

  // ── 2. Needs Attention — sorted At Risk → Watch ──────────────────────────
  const HEALTH_ORDER: Record<string, number> = { at_risk: 0, watch: 1, healthy: 2 };
  const needsAttention = targetsWithMilestones
    .filter((t) => (flagsByTarget.get(t.id) ?? []).length > 0)
    .map((t) => fmtTarget(t))
    .sort((a, b) => (HEALTH_ORDER[a.healthScore ?? "healthy"] ?? 2) - (HEALTH_ORDER[b.healthScore ?? "healthy"] ?? 2));

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

  // ── 9. Diligence Health ──────────────────────────────────────────────────
  const fmtDiligenceTarget = (t: (typeof targetsWithMilestones)[number]) => {
    const stats = diligenceStatsByTarget.get(t.id) ?? { total: 0, completed: 0, blocked: 0 };
    return {
      id: t.id,
      targetCode: t.targetCode,
      projectName: t.projectName,
      priorityTier: t.priorityTier,
      currentStage: t.currentStage ?? "Sourcing",
      total: stats.total,
      completed: stats.completed,
      pct: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
      blocked: stats.blocked,
    };
  };

  const lowCompletionMustWin = targetsWithMilestones
    .filter((t) => {
      if (t.priorityTier !== "Must-Win") return false;
      const stats = diligenceStatsByTarget.get(t.id) ?? { total: 0, completed: 0, blocked: 0 };
      const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
      return pct < 50;
    })
    .map(fmtDiligenceTarget)
    .sort((a, b) => a.pct - b.pct);

  const blockedTargets = targetsWithMilestones
    .filter((t) => {
      const stats = diligenceStatsByTarget.get(t.id);
      return stats ? stats.blocked > 0 : false;
    })
    .map(fmtDiligenceTarget)
    .sort((a, b) => b.blocked - a.blocked);

  return res.json({
    mustWin,
    needsAttention,
    overdueActions,
    dueThisWeek,
    recentStageChanges,
    recentlyUpdated,
    noOpenAction,
    noRecentInteraction,
    diligenceHealth: {
      lowCompletionMustWin,
      blockedTargets,
    },
  });
});

export default router;
