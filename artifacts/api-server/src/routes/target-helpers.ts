import { eq, and, inArray, isNull, desc } from "drizzle-orm";
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
  strategicFitScore: number;
  synergyScore: number;
  financialAttractivenessScore: number;
  processMaturityScore: number;
  riskPenaltyScore: number;
}): number {
  const gross =
    t.strategicFitScore * 0.25 +
    t.synergyScore * 0.2 +
    t.financialAttractivenessScore * 0.2 +
    t.processMaturityScore * 0.15 +
    20;
  return Math.max(0, Math.min(100, Math.round(gross - t.riskPenaltyScore)));
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fortyFiveDaysAgo = new Date(today);
  fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

  const [allActions, allInteractions, allStageChanges] = await Promise.all([
    db.select().from(actionItemsTable).where(and(inArray(actionItemsTable.targetId, targetIds), isNull(actionItemsTable.workstream))),
    db.select().from(interactionsTable).where(inArray(interactionsTable.targetId, targetIds)),
    db.select().from(stageChangeLogTable).where(inArray(stageChangeLogTable.targetId, targetIds)).orderBy(desc(stageChangeLogTable.changedAt)),
  ]);

  const actionsByTarget = new Map<number, ActionRow[]>();
  const interactionsByTarget = new Map<number, InteractionRow[]>();
  const latestStageChangeByTarget = new Map<number, StageChangeRow>();

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

  return rows.map(({ target, milestone }) => {
    const actions = actionsByTarget.get(target.id) ?? [];
    const interactions = interactionsByTarget.get(target.id) ?? [];
    const latestStageChange = latestStageChangeByTarget.get(target.id);

    const openActions = actions.filter((a) => ["Open", "In Progress", "Blocked"].includes(a.status));
    const overdueActions = openActions.filter((a) => a.dueDate && new Date(a.dueDate) < today);

    const sortedInteractions = [...interactions].sort(
      (a, b) => new Date(b.interactionDatetime).getTime() - new Date(a.interactionDatetime).getTime(),
    );
    const lastInteractionDate = sortedInteractions.length > 0 ? toIso(sortedInteractions[0].interactionDatetime) : null;

    const flags: string[] = [];
    if (overdueActions.length > 0) flags.push("overdue_action");

    const targetCreatedAt = target.createdAt ? new Date(target.createdAt) : null;
    if (interactions.length === 0) {
      if (targetCreatedAt && targetCreatedAt < thirtyDaysAgo) flags.push("no_recent_interaction");
    } else {
      const latestInteractionDate = new Date(sortedInteractions[0].interactionDatetime);
      if (latestInteractionDate < thirtyDaysAgo) flags.push("no_recent_interaction");
    }

    if (target.priorityTier === "Must-Win" && openActions.length === 0) flags.push("must_win_no_action");

    if (latestStageChange) {
      if (new Date(latestStageChange.changedAt) < fortyFiveDaysAgo) flags.push("stale_stage");
    } else if (milestone?.stageEnteredAt) {
      if (new Date(milestone.stageEnteredAt) < fortyFiveDaysAgo) flags.push("stale_stage");
    }

    return {
      ...formatTarget(target, milestone),
      openActionCount: openActions.length,
      overdueActionCount: overdueActions.length,
      lastInteractionDate,
      needsAttention: flags.length > 0,
      flags,
    };
  });
}
