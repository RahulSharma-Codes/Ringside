import { Router } from "express";
import { eq, isNotNull, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { actionItemsTable, targetsTable, milestonesTable } from "@workspace/db";
import { getAccessScope } from "../lib/target-access";

const router = Router();

const WORKSTREAMS = [
  "Commercial", "Financial", "Legal", "Tax",
  "HR", "Technology", "Operations", "Integration",
  "ESG", "Regulatory",
] as const;

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

// GET /api/diligence/review?dealType=<optional> — pipeline-wide diligence review
router.get("/review", async (req, res) => {
  const dealType = (req.query.dealType as string | undefined) || undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const scope = await getAccessScope(req);
  if (!scope.isAdmin && scope.accessibleTargetIds.length === 0) {
    return res.json({
      mustWinIncomplete: [], blockedItems: [], overdueItems: [], recentlyCompleted: [], targetSummaries: [],
    });
  }
  const accessCondition = !scope.isAdmin
    ? [inArray(targetsTable.id, scope.accessibleTargetIds)]
    : [];

  // Build target conditions
  const targetConditions = [...accessCondition] as ReturnType<typeof eq>[];
  if (dealType) targetConditions.push(eq(targetsTable.dealType, dealType));

  const [allItems, allTargets, allMilestones] = await Promise.all([
    db
      .select({
        id: actionItemsTable.id,
        targetId: actionItemsTable.targetId,
        description: actionItemsTable.description,
        owner: actionItemsTable.owner,
        dueDate: actionItemsTable.dueDate,
        priority: actionItemsTable.priority,
        status: actionItemsTable.status,
        workstream: actionItemsTable.workstream,
        notes: actionItemsTable.notes,
        completedAt: actionItemsTable.completedAt,
        createdAt: actionItemsTable.createdAt,
        targetName: targetsTable.projectName,
        targetCode: targetsTable.targetCode,
        priorityTier: targetsTable.priorityTier,
        dealType: targetsTable.dealType,
        currentStage: milestonesTable.currentStage,
      })
      .from(actionItemsTable)
      .leftJoin(targetsTable, eq(actionItemsTable.targetId, targetsTable.id))
      .leftJoin(milestonesTable, eq(milestonesTable.targetId, actionItemsTable.targetId))
      .where(
        and(
          isNotNull(actionItemsTable.workstream),
          ...(dealType ? [eq(targetsTable.dealType, dealType)] : []),
          ...accessCondition,
        ),
      ),
    db
      .select()
      .from(targetsTable)
      .where(targetConditions.length > 0 ? and(...targetConditions) : undefined),
    db.select().from(milestonesTable),
  ]);

  // Build per-target summaries — covers ALL active targets, defaulting to zeros
  // for targets with no diligence items so Must-Win targets are never omitted.
  const itemsByTarget = new Map<number, (typeof allItems)>();
  for (const item of allItems) {
    if (!itemsByTarget.has(item.targetId)) itemsByTarget.set(item.targetId, []);
    itemsByTarget.get(item.targetId)!.push(item);
  }

  const milestoneByTarget = new Map<number, (typeof allMilestones)[number]>();
  for (const m of allMilestones) milestoneByTarget.set(m.targetId, m);

  // Include every active target (matching deal type if filtered), defaulting to empty items for those with none.
  const activeTargets = allTargets.filter((t) => t.isActive !== false);
  const targetSummaries = activeTargets.map((target) => {
    const items = itemsByTarget.get(target.id) ?? [];
    const milestone = milestoneByTarget.get(target.id);
    const total = items.length;
    const completed = items.filter((i) => i.status === "Completed").length;
    const blocked = items.filter((i) => i.status === "Blocked").length;
    const overdue = items.filter(
      (i) => i.status !== "Completed" && i.dueDate && new Date(i.dueDate) < today,
    ).length;
    const presentWs = new Set(items.map((i) => i.workstream!));
    const missingWorkstreams = [...WORKSTREAMS].filter((w) => !presentWs.has(w));

    return {
      id: target.id,
      targetCode: target.targetCode,
      projectName: target.projectName,
      priorityTier: target.priorityTier,
      dealType: target.dealType ?? null,
      currentStage: milestone?.currentStage ?? "Sourcing",
      total,
      completed,
      pct: total > 0 ? Math.round((completed / total) * 100) : 0,
      blocked,
      overdue,
      missingWorkstreams,
    };
  });

  // Must-Win targets with any incomplete diligence, including those with zero items
  // (total === 0 means no diligence coverage yet — always incomplete)
  const mustWinIncomplete = targetSummaries
    .filter((s) => s.priorityTier === "Must-Win" && (s.total === 0 || s.completed < s.total))
    .sort((a, b) => a.pct - b.pct);

  const formatReviewItem = (i: (typeof allItems)[number]) => ({
    id: i.id,
    targetId: i.targetId,
    targetCode: i.targetCode,
    targetName: i.targetName ?? `Target #${i.targetId}`,
    priorityTier: i.priorityTier,
    dealType: i.dealType ?? null,
    currentStage: i.currentStage ?? "Unknown",
    workstream: i.workstream,
    description: i.description,
    owner: i.owner,
    dueDate: toDateString(i.dueDate),
    priority: i.priority,
    status: i.status,
    notes: i.notes,
    completedAt: toIso(i.completedAt),
  });

  const blockedItems = allItems.filter((i) => i.status === "Blocked").map(formatReviewItem);
  const overdueItems = allItems
    .filter((i) => i.status !== "Completed" && i.dueDate && new Date(i.dueDate) < today)
    .map(formatReviewItem);
  const recentlyCompleted = allItems
    .filter(
      (i) =>
        i.status === "Completed" &&
        i.completedAt &&
        new Date(i.completedAt) >= fourteenDaysAgo,
    )
    .map(formatReviewItem);

  return res.json({
    mustWinIncomplete,
    blockedItems,
    overdueItems,
    recentlyCompleted,
    targetSummaries: targetSummaries.sort((a, b) => a.pct - b.pct),
  });
});

export default router;
