import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  actionItemsTable,
  interactionsTable,
  stageChangeLogTable,
} from "@workspace/db";
import { eq, inArray, gte, desc } from "drizzle-orm";

export interface AiContext {
  generatedAt: string;
  summary: {
    totalTargets: number;
    activeTargets: number;
    openActions: number;
    overdueActions: number;
  };
  targets: AiTarget[];
  openActions: AiAction[];
  recentInteractions: AiInteraction[];
  recentStageChanges: AiStageChange[];
}

interface AiTarget {
  id: number;
  code: string;
  name: string;
  sector: string | null;
  tier: string;
  stage: string;
  isActive: boolean;
}

interface AiAction {
  id: number;
  targetName: string;
  description: string;
  owner: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  isOverdue: boolean;
}

interface AiInteraction {
  targetName: string;
  type: string;
  date: string;
  summary: string;
  sentiment: string | null;
}

interface AiStageChange {
  targetName: string;
  from: string | null;
  to: string;
  changedBy: string | null;
  changedAt: string;
}

function toDateString(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
}

export async function buildAiContext(): Promise<AiContext> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── Targets with current stage from milestones ──────────────────────────
  const targetsRaw = await db
    .select({
      id: targetsTable.id,
      targetCode: targetsTable.targetCode,
      projectName: targetsTable.projectName,
      sector: targetsTable.sector,
      priorityTier: targetsTable.priorityTier,
      isActive: targetsTable.isActive,
      currentStage: milestonesTable.currentStage,
    })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .limit(50);

  const targets: AiTarget[] = targetsRaw.map((t) => ({
    id: t.id,
    code: t.targetCode,
    name: t.projectName,
    sector: t.sector,
    tier: t.priorityTier,
    stage: t.currentStage ?? "Unknown",
    isActive: t.isActive,
  }));

  // ── Open + overdue actions ──────────────────────────────────────────────
  const actionsRaw = await db
    .select({
      id: actionItemsTable.id,
      targetId: actionItemsTable.targetId,
      description: actionItemsTable.description,
      owner: actionItemsTable.owner,
      dueDate: actionItemsTable.dueDate,
      priority: actionItemsTable.priority,
      status: actionItemsTable.status,
      targetName: targetsTable.projectName,
    })
    .from(actionItemsTable)
    .leftJoin(targetsTable, eq(actionItemsTable.targetId, targetsTable.id))
    .where(inArray(actionItemsTable.status, ["Open", "In Progress", "Blocked"]))
    .limit(30);

  const todayStr = now.toISOString().slice(0, 10);
  const openActions: AiAction[] = actionsRaw.map((a) => {
    const dueDateStr = toDateString(a.dueDate);
    const isOverdue = Boolean(dueDateStr && dueDateStr < todayStr);
    return {
      id: a.id,
      targetName: a.targetName ?? "Unknown",
      description: a.description,
      owner: a.owner,
      dueDate: dueDateStr,
      priority: a.priority,
      status: a.status,
      isOverdue,
    };
  });

  // ── Recent interactions (last 30 days) ──────────────────────────────────
  const interactionsRaw = await db
    .select({
      targetId: interactionsTable.targetId,
      interactionType: interactionsTable.interactionType,
      interactionDatetime: interactionsTable.interactionDatetime,
      summary: interactionsTable.summary,
      sentiment: interactionsTable.sentiment,
      targetName: targetsTable.projectName,
    })
    .from(interactionsTable)
    .leftJoin(targetsTable, eq(interactionsTable.targetId, targetsTable.id))
    .where(gte(interactionsTable.interactionDatetime, thirtyDaysAgo))
    .orderBy(desc(interactionsTable.interactionDatetime))
    .limit(20);

  const recentInteractions: AiInteraction[] = interactionsRaw.map((i) => ({
    targetName: i.targetName ?? "Unknown",
    type: i.interactionType,
    date: toIso(i.interactionDatetime) ?? "",
    summary: i.summary,
    sentiment: i.sentiment,
  }));

  // ── Recent stage changes ─────────────────────────────────────────────────
  const stageChangesRaw = await db
    .select({
      targetId: stageChangeLogTable.targetId,
      previousStage: stageChangeLogTable.previousStage,
      newStage: stageChangeLogTable.newStage,
      changedBy: stageChangeLogTable.changedBy,
      changedAt: stageChangeLogTable.changedAt,
      targetName: targetsTable.projectName,
    })
    .from(stageChangeLogTable)
    .leftJoin(targetsTable, eq(stageChangeLogTable.targetId, targetsTable.id))
    .orderBy(desc(stageChangeLogTable.changedAt))
    .limit(20);

  const recentStageChanges: AiStageChange[] = stageChangesRaw.map((s) => ({
    targetName: s.targetName ?? "Unknown",
    from: s.previousStage,
    to: s.newStage,
    changedBy: s.changedBy,
    changedAt: toIso(s.changedAt) ?? "",
  }));

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalTargets: targets.length,
      activeTargets: targets.filter((t) => t.isActive).length,
      openActions: openActions.length,
      overdueActions: openActions.filter((a) => a.isOverdue).length,
    },
    targets,
    openActions,
    recentInteractions,
    recentStageChanges,
  };
}
