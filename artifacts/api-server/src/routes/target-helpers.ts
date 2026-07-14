import { eq, and, inArray, isNull, isNotNull, desc } from "drizzle-orm";
import { computeHealthScore } from "../lib/health-score";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  interactionsTable,
  actionItemsTable,
  stageChangeLogTable,
} from "@workspace/db";

export type TargetRow = typeof targetsTable.$inferSelect;
export type MilestoneRow = typeof milestonesTable.$inferSelect | null;
export type ActionRow = typeof actionItemsTable.$inferSelect;
export type InteractionRow = typeof interactionsTable.$inferSelect;
export type StageChangeRow = typeof stageChangeLogTable.$inferSelect;
export type DocumentRow = { id: number; targetId: number; title: string | null; documentType: string | null; status: string | null; [key: string]: unknown };

export type { HealthScore } from "../lib/health-score";

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export function toDateString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

export function currentStage(milestone: MilestoneRow): string {
  return milestone?.currentStage ?? "Sourcing";
}

export function calcPriorityScore(t: {
  strategicFitScore: number | null;
  synergyScore: number | null;
  financialAttractivenessScore: number | null;
  processMaturityScore: number | null;
  riskPenaltyScore: number | null;
}): number {
  const gross =
    (t.strategicFitScore ?? 0) * 0.25 +
    (t.synergyScore ?? 0) * 0.2 +
    (t.financialAttractivenessScore ?? 0) * 0.2 +
    (t.processMaturityScore ?? 0) * 0.15 +
    20;
  return Math.max(0, Math.min(100, Math.round(gross - (t.riskPenaltyScore ?? 0))));
}

export function formatTarget(t: TargetRow, milestone: MilestoneRow = null) {
  return {
    ...t,
    currentStage: currentStage(milestone),
    priorityScore: calcPriorityScore(t),
    createdAt: toIso(t.createdAt),
    updatedAt: toIso(t.updatedAt),
  };
}

export function formatInteraction(i: InteractionRow) {
  return {
    ...i,
    interactionDatetime: toIso(i.interactionDatetime),
    createdAt: toIso(i.createdAt),
  };
}

export function formatAction(a: ActionRow) {
  return {
    ...a,
    dueDate: toDateString(a.dueDate),
    createdAt: toIso(a.createdAt),
    completedAt: toIso(a.completedAt),
  };
}

export function formatStageChange(s: StageChangeRow) {
  return {
    ...s,
    changedAt: toIso(s.changedAt),
  };
}

export function defaultMilestoneValues(targetId: number, now: Date, currentStageValue = "Sourcing") {
  return {
    targetId,
    currentStage: currentStageValue,
    stageEnteredAt: now,
    ndaStatus: "Not Sent",
    dataRoomAccess: "No",
    commercialDdStatus: "Not Started",
    financialDdStatus: "Not Started",
    legalDdStatus: "Not Started",
    taxDdStatus: "Not Started",
    techDdStatus: "Not Started",
    updatedAt: now,
  };
}

export async function enrichTargetRows(rows: { target: TargetRow; milestone: MilestoneRow }[]) {
  if (rows.length === 0) return [];

  const targetIds = rows.map((r) => r.target.id);
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fortyFiveDaysAgo = new Date(today);
  fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

  const [allActions, allInteractions, allStageChanges, allDiligenceItems] = await Promise.all([
    db.select().from(actionItemsTable).where(and(inArray(actionItemsTable.targetId, targetIds), isNull(actionItemsTable.workstream))),
    db.select().from(interactionsTable).where(inArray(interactionsTable.targetId, targetIds)),
    db.select().from(stageChangeLogTable).where(inArray(stageChangeLogTable.targetId, targetIds)).orderBy(desc(stageChangeLogTable.changedAt)),
    db.select({ targetId: actionItemsTable.targetId, status: actionItemsTable.status })
      .from(actionItemsTable)
      .where(and(inArray(actionItemsTable.targetId, targetIds), isNotNull(actionItemsTable.workstream))),
  ]);

  const actionsByTarget = new Map<number, ActionRow[]>();
  const interactionsByTarget = new Map<number, InteractionRow[]>();
  const latestStageChangeByTarget = new Map<number, StageChangeRow>();
  const diligenceStatsByTarget = new Map<number, { total: number; completed: number }>();

  for (const action of allActions) {
    if (!actionsByTarget.has(action.targetId)) actionsByTarget.set(action.targetId, []);
    actionsByTarget.get(action.targetId)!.push(action);
  }
  for (const inter of allInteractions) {
    if (!interactionsByTarget.has(inter.targetId)) interactionsByTarget.set(inter.targetId, []);
    interactionsByTarget.get(inter.targetId)!.push(inter);
  }
  for (const sc of allStageChanges) {
    if (!latestStageChangeByTarget.has(sc.targetId)) {
      latestStageChangeByTarget.set(sc.targetId, sc);
    }
  }
  for (const item of allDiligenceItems) {
    const s = diligenceStatsByTarget.get(item.targetId) ?? { total: 0, completed: 0 };
    s.total++;
    if (item.status === "Completed") s.completed++;
    diligenceStatsByTarget.set(item.targetId, s);
  }

  return rows.map(({ target, milestone }) => {
    const actions = actionsByTarget.get(target.id) ?? [];
    const interactions = interactionsByTarget.get(target.id) ?? [];
    const latestStageChange = latestStageChangeByTarget.get(target.id);
    const diligenceStats = diligenceStatsByTarget.get(target.id) ?? { total: 0, completed: 0 };

    const openActions = actions.filter((a) => ["Open", "In Progress", "Blocked"].includes(a.status));
    const overdueActions = openActions.filter((a) => a.dueDate && new Date(a.dueDate) < today);

    const sortedInteractions = [...interactions].sort(
      (a, b) => new Date(b.interactionDatetime).getTime() - new Date(a.interactionDatetime).getTime(),
    );
    const lastInteractionDate = sortedInteractions.length > 0 ? toIso(sortedInteractions[0].interactionDatetime) : null;

    // Date-based health score inputs
    const targetCreatedAt = target.createdAt ? new Date(target.createdAt) : null;
    const targetAgeInDays = targetCreatedAt
      ? Math.floor((now.getTime() - targetCreatedAt.getTime()) / 86_400_000)
      : 0;
    const daysSinceLastInteraction = sortedInteractions.length > 0
      ? Math.floor((now.getTime() - new Date(sortedInteractions[0].interactionDatetime).getTime()) / 86_400_000)
      : null;
    const stageDate = latestStageChange
      ? new Date(latestStageChange.changedAt)
      : milestone?.stageEnteredAt ? new Date(milestone.stageEnteredAt) : null;
    const daysInCurrentStage = stageDate
      ? Math.floor((now.getTime() - stageDate.getTime()) / 86_400_000)
      : null;

    // Legacy attention flags (used for needsAttention and dashboard)
    const flags: string[] = [];
    if (overdueActions.length > 0) flags.push("overdue_action");
    if (!sortedInteractions.length) {
      if (targetCreatedAt && targetCreatedAt < thirtyDaysAgo) flags.push("no_recent_interaction");
    } else if (new Date(sortedInteractions[0].interactionDatetime) < thirtyDaysAgo) {
      flags.push("no_recent_interaction");
    }
    if (target.priorityTier === "Must-Win" && openActions.length === 0) flags.push("must_win_no_action");
    if (stageDate && stageDate < fortyFiveDaysAgo) flags.push("stale_stage");

    return {
      ...formatTarget(target, milestone),
      openActionCount: openActions.length,
      overdueActionCount: overdueActions.length,
      lastInteractionDate,
      daysInCurrentStage,
      diligencePct: diligenceStats.total > 0
        ? Math.round((diligenceStats.completed / diligenceStats.total) * 100)
        : null,
      needsAttention: flags.length > 0,
      flags,
      healthScore: computeHealthScore({
        daysSinceLastInteraction,
        targetAgeInDays,
        openActionCount: openActions.length,
        overdueActionCount: overdueActions.length,
        diligenceTotalItems: diligenceStats.total,
        diligenceCompletedItems: diligenceStats.completed,
        daysInCurrentStage,
        currentStage: currentStage(milestone),
      }),
    };
  });
}
