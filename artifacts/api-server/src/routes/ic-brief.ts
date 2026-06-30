import { Router } from "express";
import { eq, and, isNull, isNotNull, desc, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  actionItemsTable,
  interactionsTable,
  icSessionsTable,
  valuationsTable,
  dealEconomicsTable,
  synergiesTable,
  dealAdvisorsTable,
  stageChangeLogTable,
} from "@workspace/db";
import { toIso, toDateString, formatAction, formatInteraction, formatTarget } from "./target-helpers";
import { computeHealthScore } from "../lib/health-score";

const router = Router();

function id(req: { params: Record<string, string | string[]> }): number {
  return parseInt(req.params.id as string, 10);
}

function formatValuation(v: typeof valuationsTable.$inferSelect) {
  return { ...v, recordedAt: toIso(v.recordedAt) };
}

function formatSynergy(s: typeof synergiesTable.$inferSelect) {
  return { ...s, createdAt: toIso(s.createdAt), updatedAt: toIso(s.updatedAt) };
}

function formatIcSession(s: typeof icSessionsTable.$inferSelect) {
  return {
    ...s,
    sessionDate: s.sessionDate ? String(s.sessionDate).slice(0, 10) : null,
    createdAt: toIso(s.createdAt),
  };
}

function formatAdvisor(a: typeof dealAdvisorsTable.$inferSelect) {
  return {
    ...a,
    engagementDate: a.engagementDate ? String(a.engagementDate).slice(0, 10) : null,
    createdAt: toIso(a.createdAt),
  };
}

function formatEconomics(e: typeof dealEconomicsTable.$inferSelect) {
  return { ...e, updatedAt: toIso(e.updatedAt) };
}

// GET /api/targets/:id/ic-brief
router.get("/:id/ic-brief", async (req, res) => {
  const targetId = id(req);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid id" });

  const [
    targetResult,
    milestoneResult,
    icSessions,
    allInteractions,
    allActions,
    allDiligenceItems,
    advisors,
    valuations,
    economicsResult,
    synergies,
    latestStageChange,
  ] = await Promise.all([
    db.select().from(targetsTable).where(eq(targetsTable.id, targetId)).limit(1),
    db.select().from(milestonesTable).where(eq(milestonesTable.targetId, targetId)).limit(1),
    db.select().from(icSessionsTable).where(eq(icSessionsTable.targetId, targetId)).orderBy(desc(icSessionsTable.sessionDate), desc(icSessionsTable.createdAt)),
    db.select().from(interactionsTable).where(eq(interactionsTable.targetId, targetId)).orderBy(desc(interactionsTable.interactionDatetime)).limit(5),
    db.select().from(actionItemsTable).where(and(eq(actionItemsTable.targetId, targetId), isNull(actionItemsTable.workstream), ne(actionItemsTable.status, "Completed"))).orderBy(desc(actionItemsTable.createdAt)),
    db.select().from(actionItemsTable).where(and(eq(actionItemsTable.targetId, targetId), isNotNull(actionItemsTable.workstream))),
    db.select().from(dealAdvisorsTable).where(eq(dealAdvisorsTable.targetId, targetId)).orderBy(dealAdvisorsTable.side, dealAdvisorsTable.advisorType),
    db.select().from(valuationsTable).where(eq(valuationsTable.targetId, targetId)).orderBy(desc(valuationsTable.recordedAt)),
    db.select().from(dealEconomicsTable).where(eq(dealEconomicsTable.targetId, targetId)).limit(1),
    db.select().from(synergiesTable).where(eq(synergiesTable.targetId, targetId)).orderBy(synergiesTable.type, desc(synergiesTable.createdAt)),
    db.select().from(stageChangeLogTable).where(eq(stageChangeLogTable.targetId, targetId)).orderBy(desc(stageChangeLogTable.changedAt)).limit(1),
  ]);

  const target = targetResult[0];
  if (!target) return res.status(404).json({ error: "Target not found" });

  const milestone = milestoneResult[0] ?? null;
  const currentStage = milestone?.currentStage ?? "Sourcing";
  const economics = economicsResult[0] ?? null;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const diligenceTotal = allDiligenceItems.length;
  const diligenceCompleted = allDiligenceItems.filter((i) => i.status === "Completed").length;
  const diligenceBlocked = allDiligenceItems.filter((i) => i.status === "Blocked").length;
  const diligenceOverdue = allDiligenceItems.filter(
    (i) => i.status !== "Completed" && i.dueDate && new Date(i.dueDate) < today,
  ).length;
  const diligencePct = diligenceTotal > 0 ? Math.round((diligenceCompleted / diligenceTotal) * 100) : 0;

  const WORKSTREAMS = ["Commercial", "Financial", "Legal", "Tax", "HR", "Technology", "Operations", "Integration", "ESG", "Regulatory"];
  const presentWorkstreams = new Set(allDiligenceItems.map((i) => i.workstream!));
  const missingWorkstreams = WORKSTREAMS.filter((w) => !presentWorkstreams.has(w));

  const openActionCount = allActions.length;
  const overdueActionCount = allActions.filter((a) => a.dueDate && new Date(a.dueDate) < today).length;

  const sortedInteractions = [...allInteractions].sort(
    (a, b) => new Date(b.interactionDatetime).getTime() - new Date(a.interactionDatetime).getTime(),
  );
  const daysSinceLastInteraction =
    sortedInteractions.length > 0
      ? Math.floor((now.getTime() - new Date(sortedInteractions[0].interactionDatetime).getTime()) / 86_400_000)
      : null;

  const targetCreatedAt = target.createdAt ? new Date(target.createdAt) : null;
  const targetAgeInDays = targetCreatedAt
    ? Math.floor((now.getTime() - targetCreatedAt.getTime()) / 86_400_000)
    : 0;

  const stageDate = latestStageChange[0]
    ? new Date(latestStageChange[0].changedAt)
    : milestone?.stageEnteredAt ? new Date(milestone.stageEnteredAt) : null;
  const daysInCurrentStage = stageDate
    ? Math.floor((now.getTime() - stageDate.getTime()) / 86_400_000)
    : null;

  const healthScore = computeHealthScore({
    daysSinceLastInteraction,
    targetAgeInDays,
    openActionCount,
    overdueActionCount,
    diligenceTotalItems: diligenceTotal,
    diligenceCompletedItems: diligenceCompleted,
    daysInCurrentStage,
    currentStage,
  });

  const formattedTarget = formatTarget(target, milestone);

  return res.json({
    target: {
      ...formattedTarget,
      healthScore,
      daysInCurrentStage,
      openActionCount,
      overdueActionCount,
      daysSinceLastInteraction,
    },
    diligence: {
      total: diligenceTotal,
      completed: diligenceCompleted,
      blocked: diligenceBlocked,
      overdue: diligenceOverdue,
      pct: diligencePct,
      missingWorkstreams,
    },
    icSessions: icSessions.map(formatIcSession),
    recentInteractions: allInteractions.map(formatInteraction),
    openActions: allActions.map(formatAction),
    advisors: advisors.map(formatAdvisor),
    valuations: valuations.map(formatValuation),
    economics: economics ? formatEconomics(economics) : null,
    synergies: synergies.map(formatSynergy),
    generatedAt: now.toISOString(),
  });
});

export default router;
