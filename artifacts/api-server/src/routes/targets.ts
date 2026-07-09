import { Router } from "express";
import { requireRole } from "../middlewares/auth";
import interactionsSubRouter from "./target-interactions";
import actionsSubRouter from "./target-actions";
import { eq, and, ilike, or, desc, isNull, isNotNull, inArray, type SQL } from "drizzle-orm";
import { db, targetAccessTable } from "@workspace/db";
import {
  targetsTable, milestonesTable, interactionsTable, actionItemsTable, stageChangeLogTable, usersTable,
} from "@workspace/db";
import {
  CreateTargetBody, UpdateTargetBody, UpdateTargetStageBody, ListTargetsQueryParams,
} from "@workspace/api-zod";
import { z } from "zod";
import { TERMINAL_STAGES, PIPELINE_STAGE_ORDER } from "../constants";
import { writeAuditEvent } from "./audit";
import {
  toIso, formatTarget, formatInteraction, formatAction, formatStageChange,
  currentStage, calcPriorityScore, defaultMilestoneValues, enrichTargetRows,
} from "./target-helpers";
import { computeHealthScore } from "../lib/health-score";
import {
  evaluateGates, fetchGateContext, nextPipelineStage,
} from "./target-stage-gate-config";
import { getAccessScope, canAccessTarget, grantTargetAccess } from "../lib/target-access";

const router = Router();

/** Adds a visibility condition to `conditions` for non-admins. Returns true if the
 *  caller has zero granted targets and the route should short-circuit with an empty result. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyAccessScope(req: import("express").Request, conditions: any[]): Promise<boolean> {
  const scope = await getAccessScope(req);
  if (scope.isAdmin) return false;
  if (scope.accessibleTargetIds.length === 0) return true;
  conditions.push(inArray(targetsTable.id, scope.accessibleTargetIds));
  return false;
}

// ── GET /api/targets ──────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const parsed = ListTargetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { sector, priorityTier, stage, search, isActive, owner, country, needsAttention, dealType, myDeals } =
    parsed.data;

  const conditions: SQL[] = [];
  if (isActive !== undefined) conditions.push(eq(targetsTable.isActive, isActive));
  else conditions.push(eq(targetsTable.isActive, true));
  if (sector) conditions.push(eq(targetsTable.sector, sector));
  if (priorityTier) conditions.push(eq(targetsTable.priorityTier, priorityTier));
  if (stage) conditions.push(eq(milestonesTable.currentStage, stage));
  if (myDeals && req.jwtClaims?.email) {
    const email = req.jwtClaims.email.toLowerCase();
    const [userRow] = await db
      .select({ displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    const displayName = userRow?.displayName?.trim();
    conditions.push(
      displayName
        ? or(ilike(targetsTable.dealOwner, email), ilike(targetsTable.dealOwner, displayName))!
        : ilike(targetsTable.dealOwner, email),
    );
  } else if (owner) {
    conditions.push(eq(targetsTable.dealOwner, owner));
  }
  if (country) conditions.push(eq(targetsTable.country, country));
  if (dealType) conditions.push(eq(targetsTable.dealType, dealType));
  if (search) {
    conditions.push(
      or(
        ilike(targetsTable.projectName, `%${search}%`),
        ilike(targetsTable.targetCode, `%${search}%`),
        ilike(targetsTable.legalName, `%${search}%`),
        ilike(targetsTable.country, `%${search}%`),
        ilike(targetsTable.sector, `%${search}%`),
      )!,
    );
  }

  if (await applyAccessScope(req, conditions)) return res.json([]);

  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(and(...conditions))
    .orderBy(desc(targetsTable.updatedAt));

  let enriched = await enrichTargetRows(rows);
  if (needsAttention) enriched = enriched.filter((t) => t.needsAttention);
  return res.json(enriched);
});

// ── PUT /api/targets/reorder — batch-update kanban_sort_order within a stage ──

router.put("/reorder", async (req, res) => {
  const parsed = z
    .object({
      orders: z.array(
        z.object({ id: z.number().int(), sortOrder: z.number().int() }),
      ),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { orders } = parsed.data;
  if (orders.length === 0) return res.json({ updated: 0 });

  // Run all updates in a single transaction so a partial failure leaves no mixed state
  await db.transaction(async (tx) => {
    for (const { id, sortOrder } of orders) {
      await tx
        .update(targetsTable)
        .set({ kanbanSortOrder: sortOrder })
        .where(eq(targetsTable.id, id));
    }
  });

  return res.json({ updated: orders.length });
});

// ── POST /api/targets ─────────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  const parsed = CreateTargetBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  const now = new Date();

  const [target] = await db
    .insert(targetsTable)
    .values({
      targetCode: data.targetCode,
      projectName: data.projectName,
      legalName: data.legalName ?? null,
      businessUnit: data.businessUnit ?? null,
      sector: data.sector ?? null,
      subsector: data.subsector ?? null,
      geographyRegion: data.geographyRegion ?? null,
      country: data.country ?? null,
      sourcingChannel: data.sourcingChannel ?? null,
      sourcingFirm: data.sourcingFirm ?? null,
      dealOwner: data.dealOwner ?? null,
      dealChampion: data.dealChampion ?? null,
      executiveSponsor: data.executiveSponsor ?? null,
      priorityTier: data.priorityTier ?? "Watchlist",
      strategicRationale: data.strategicRationale ?? null,
      strategicFitScore: data.strategicFitScore ?? 50,
      synergyScore: data.synergyScore ?? 50,
      financialAttractivenessScore: data.financialAttractivenessScore ?? 50,
      processMaturityScore: data.processMaturityScore ?? 50,
      riskPenaltyScore: data.riskPenaltyScore ?? 0,
      dealType: data.dealType ?? null,
      isActive: true,
      isConfidential: data.isConfidential ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const [milestone] = await db
    .insert(milestonesTable)
    .values(defaultMilestoneValues(target.id, now, "Sourcing"))
    .returning();

  await db.insert(stageChangeLogTable).values({
    targetId: target.id,
    previousStage: null,
    newStage: "Sourcing",
    changedBy: data.dealOwner ?? "System",
    changeReason: "Initial opportunity creation",
    changedAt: now,
  });

  await writeAuditEvent("deal_created", target.id, data.dealOwner ?? null, {
    targetCode: target.targetCode,
    projectName: target.projectName,
    dealType: target.dealType,
    initialStage: "Sourcing",
  });

  // Auto-grant the creator visibility into the deal they just created.
  const scope = await getAccessScope(req);
  if (scope.userId) await grantTargetAccess(target.id, scope.userId, scope.userId);

  return res.status(201).json(formatTarget(target, milestone));
});

// ── GET /api/targets/summary — must come before /:id ─────────────────────────

router.get("/summary", async (req, res) => {
  const conditions: SQL[] = [];
  if (await applyAccessScope(req, conditions)) {
    return res.json({
      activeTargets: 0, mustWinCount: 0, priority1Count: 0, openActionsCount: 0,
      overdueActionsCount: 0, closedDealsCount: 0, droppedDealsCount: 0, avgPriorityScore: 0,
      needsAttentionCount: 0, recentlyUpdatedCount: 0, newDealsThisWeek: 0, newMustWinThisWeek: 0,
    });
  }

  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const active = rows.filter((row) => {
    const stage = currentStage(row.milestone);
    return row.target.isActive && !TERMINAL_STAGES.has(stage);
  });

  const enriched = await enrichTargetRows(active);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentlyUpdatedCount = active.filter((row) => {
    const updatedAt = row.target.updatedAt ? new Date(row.target.updatedAt) : null;
    return updatedAt && updatedAt >= sevenDaysAgo;
  }).length;

  const accessibleTargetIdsForSummary = new Set(active.map((row) => row.target.id));
  const allActionsForSummary = (
    await db.select().from(actionItemsTable).where(isNull(actionItemsTable.workstream))
  ).filter((a) => accessibleTargetIdsForSummary.has(a.targetId));
  const openActions = allActionsForSummary.filter((a) => ["Open", "In Progress", "Blocked"].includes(a.status));
  const todayForOverdue = new Date();
  todayForOverdue.setHours(0, 0, 0, 0);
  const overdue = openActions.filter((a) => a.dueDate && new Date(a.dueDate) < todayForOverdue);

  const avgScore =
    active.length > 0
      ? active.reduce((sum, row) => sum + calcPriorityScore(row.target), 0) / active.length
      : 0;

  return res.json({
    activeTargets: active.length,
    mustWinCount: active.filter((row) => row.target.priorityTier === "Must-Win").length,
    priority1Count: active.filter((row) => row.target.priorityTier === "Priority 1").length,
    openActionsCount: openActions.length,
    overdueActionsCount: overdue.length,
    closedDealsCount: rows.filter((row) => TERMINAL_STAGES.has(currentStage(row.milestone)) && row.target.isActive).length,
    droppedDealsCount: rows.filter((row) => !row.target.isActive).length,
    avgPriorityScore: Math.round(avgScore),
    needsAttentionCount: enriched.filter((t) => t.needsAttention).length,
    recentlyUpdatedCount,
    newDealsThisWeek: rows.filter((row) => row.target.createdAt && new Date(row.target.createdAt) >= sevenDaysAgo).length,
    newMustWinThisWeek: rows.filter((row) => row.target.createdAt && new Date(row.target.createdAt) >= sevenDaysAgo && row.target.priorityTier === "Must-Win").length,
  });
});

// ── GET /api/targets/velocity — new-deals per week, last 8 weeks ─────────────

router.get("/velocity", async (req, res) => {
  const scope = await getAccessScope(req);
  if (!scope.isAdmin && scope.accessibleTargetIds.length === 0) {
    const weeks: { weekLabel: string; count: number }[] = [];
    const now0 = new Date();
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now0);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const mo = weekStart.toISOString().slice(5, 7);
      const dy = weekStart.toISOString().slice(8, 10);
      weeks.push({ weekLabel: `${mo}/${dy}`, count: 0 });
    }
    return res.json(weeks);
  }
  const rows = await db
    .select({ createdAt: targetsTable.createdAt, id: targetsTable.id })
    .from(targetsTable)
    .where(scope.isAdmin ? undefined : inArray(targetsTable.id, scope.accessibleTargetIds));
  const now = new Date();
  const weeks: { weekLabel: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - i * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const mo = weekStart.toISOString().slice(5, 7);
    const dy = weekStart.toISOString().slice(8, 10);
    const label = `${mo}/${dy}`;
    const count = rows.filter((r) => {
      if (!r.createdAt) return false;
      const d = new Date(r.createdAt);
      return d >= weekStart && d < weekEnd;
    }).length;
    weeks.push({ weekLabel: label, count });
  }
  return res.json(weeks);
});

// ── GET /api/targets/by-stage — must come before /:id ────────────────────────

router.get("/by-stage", async (req, res) => {
  const conditions = [eq(targetsTable.isActive, true)];
  if (await applyAccessScope(req, conditions)) return res.json([]);

  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(and(...conditions));

  const counts: Record<string, number> = {};
  for (const row of rows) {
    const stage = currentStage(row.milestone);
    if (!TERMINAL_STAGES.has(stage)) counts[stage] = (counts[stage] ?? 0) + 1;
  }

  const STAGE_ORDER = [
    "Sourcing", "Outreach", "Introductory Discussion", "NDA / CIM",
    "Preliminary Due Diligence", "Management Meeting", "Non-Binding Offer",
    "Confirmatory Due Diligence", "Binding Offer", "SPA Negotiation", "Integration Planning", "On Hold",
  ];

  const result = STAGE_ORDER.filter((s) => counts[s]).map((s) => ({ stage: s, count: counts[s] }));
  for (const [stage, count] of Object.entries(counts)) {
    if (!STAGE_ORDER.includes(stage)) result.push({ stage, count });
  }
  return res.json(result);
});

// ── GET /api/targets/top-priority — must come before /:id ────────────────────

router.get("/top-priority", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "5"), 10), 20);
  const conditions = [eq(targetsTable.isActive, true)];
  if (await applyAccessScope(req, conditions)) return res.json([]);

  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(and(...conditions));

  const nowTs = Date.now();
  const ranked = rows
    .filter((row) => !TERMINAL_STAGES.has(currentStage(row.milestone)))
    .map((row) => ({ target: row.target, milestone: row.milestone, priorityScore: calcPriorityScore(row.target) }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
    .map((row) => ({
      ...formatTarget(row.target, row.milestone),
      daysInCurrentStage: row.milestone?.stageEnteredAt
        ? Math.floor((nowTs - new Date(row.milestone.stageEnteredAt).getTime()) / 86_400_000)
        : null,
    }));

  return res.json(ranked);
});

// ── GET /api/targets/filter-options — must come before /:id ──────────────────

async function getFilterOptions() {
  const rows = await db
    .select({ dealOwner: targetsTable.dealOwner, country: targetsTable.country, sector: targetsTable.sector, dealType: targetsTable.dealType })
    .from(targetsTable);
  return {
    owners: [...new Set(rows.map((r) => r.dealOwner).filter((v): v is string => v !== null))].sort(),
    countries: [...new Set(rows.map((r) => r.country).filter((v): v is string => v !== null))].sort(),
    sectors: [...new Set(rows.map((r) => r.sector).filter((v): v is string => v !== null))].sort(),
    dealTypes: [...new Set(rows.map((r) => r.dealType).filter((v): v is string => v !== null))].sort(),
  };
}

router.get("/filter-options", async (_req, res) => {
  return res.json(await getFilterOptions());
});

// Alias used by review pages
router.get("/filters", async (_req, res) => {
  return res.json(await getFilterOptions());
});

// ── GET /api/targets/needs-attention — must come before /:id ─────────────────

router.get("/needs-attention", async (req, res) => {
  const conditions = [eq(targetsTable.isActive, true)];
  if (await applyAccessScope(req, conditions)) return res.json([]);

  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(and(...conditions));

  const activeRows = rows.filter((row) => !TERMINAL_STAGES.has(currentStage(row.milestone)));
  const enriched = await enrichTargetRows(activeRows);
  return res.json(enriched.filter((t) => t.needsAttention));
});

// ── GET /api/targets/:id ──────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(await canAccessTarget(req, id))) return res.status(404).json({ error: "Not found" });

  const [row] = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.id, id));

  if (!row) return res.status(404).json({ error: "Not found" });

  const [interactions, actions, stageHistory, diligenceItems] = await Promise.all([
    db.select().from(interactionsTable).where(eq(interactionsTable.targetId, id)).orderBy(desc(interactionsTable.interactionDatetime)),
    db.select().from(actionItemsTable).where(eq(actionItemsTable.targetId, id)).orderBy(desc(actionItemsTable.createdAt)),
    db.select().from(stageChangeLogTable).where(eq(stageChangeLogTable.targetId, id)).orderBy(desc(stageChangeLogTable.changedAt)),
    db.select({ status: actionItemsTable.status }).from(actionItemsTable)
      .where(and(eq(actionItemsTable.targetId, id), isNotNull(actionItemsTable.workstream))),
  ]);

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const openActions = actions.filter(
    (a) => a.workstream === null && ["Open", "In Progress", "Blocked"].includes(a.status),
  );
  const overdueActions = openActions.filter((a) => a.dueDate && new Date(a.dueDate) < today);
  const sortedInteractions = [...interactions].sort(
    (a, b) => new Date(b.interactionDatetime).getTime() - new Date(a.interactionDatetime).getTime(),
  );
  const latestStageChange = stageHistory[0];
  const stageDate = latestStageChange
    ? new Date(latestStageChange.changedAt)
    : row.milestone?.stageEnteredAt ? new Date(row.milestone.stageEnteredAt) : null;
  const targetCreatedAt = row.target.createdAt ? new Date(row.target.createdAt) : null;

  const diligenceTotal = diligenceItems.length;
  const diligenceCompleted = diligenceItems.filter((i) => i.status === "Completed").length;

  const healthScore = computeHealthScore({
    daysSinceLastInteraction: sortedInteractions.length > 0
      ? Math.floor((now.getTime() - new Date(sortedInteractions[0].interactionDatetime).getTime()) / 86_400_000)
      : null,
    targetAgeInDays: targetCreatedAt
      ? Math.floor((now.getTime() - targetCreatedAt.getTime()) / 86_400_000)
      : 0,
    openActionCount: openActions.length,
    overdueActionCount: overdueActions.length,
    diligenceTotalItems: diligenceTotal,
    diligenceCompletedItems: diligenceCompleted,
    daysInCurrentStage: stageDate
      ? Math.floor((now.getTime() - stageDate.getTime()) / 86_400_000)
      : null,
    currentStage: currentStage(row.milestone),
  });

  return res.json({
    ...formatTarget(row.target, row.milestone),
    healthScore,
    interactions: interactions.map(formatInteraction),
    actions: actions.map(formatAction),
    stageHistory: stageHistory.map(formatStageChange),
  });
});

// ── PUT /api/targets/:id ──────────────────────────────────────────────────────

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const parsed = UpdateTargetBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [existingRow] = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.id, id));

  if (!existingRow) return res.status(404).json({ error: "Not found" });

  const updates: Partial<typeof targetsTable.$inferInsert> = { updatedAt: new Date() };
  const d = parsed.data;
  if (d.projectName !== undefined) updates.projectName = d.projectName;
  if (d.legalName !== undefined) updates.legalName = d.legalName;
  if (d.businessUnit !== undefined) updates.businessUnit = d.businessUnit;
  if (d.sector !== undefined) updates.sector = d.sector;
  if (d.subsector !== undefined) updates.subsector = d.subsector;
  if (d.geographyRegion !== undefined) updates.geographyRegion = d.geographyRegion;
  if (d.country !== undefined) updates.country = d.country;
  if (d.sourcingChannel !== undefined) updates.sourcingChannel = d.sourcingChannel;
  if (d.sourcingFirm !== undefined) updates.sourcingFirm = d.sourcingFirm;
  if (d.dealOwner !== undefined) updates.dealOwner = d.dealOwner;
  if (d.dealChampion !== undefined) updates.dealChampion = d.dealChampion;
  if (d.executiveSponsor !== undefined) updates.executiveSponsor = d.executiveSponsor;
  if (d.priorityTier !== undefined) updates.priorityTier = d.priorityTier;
  if (d.strategicRationale !== undefined) updates.strategicRationale = d.strategicRationale;
  if (d.strategicFitScore !== undefined) updates.strategicFitScore = d.strategicFitScore;
  if (d.synergyScore !== undefined) updates.synergyScore = d.synergyScore;
  if (d.financialAttractivenessScore !== undefined) updates.financialAttractivenessScore = d.financialAttractivenessScore;
  if (d.processMaturityScore !== undefined) updates.processMaturityScore = d.processMaturityScore;
  if (d.riskPenaltyScore !== undefined) updates.riskPenaltyScore = d.riskPenaltyScore;
  if (d.dealType !== undefined) {
    const DEAL_TYPE_EARLY_STAGES = new Set(["Sourcing", "Outreach", "Introductory Discussion", "NDA / CIM"]);
    const existingStage = currentStage(existingRow.milestone);
    if (d.dealType !== (existingRow.target.dealType ?? null) && !DEAL_TYPE_EARLY_STAGES.has(existingStage)) {
      return res.status(422).json({
        error: `Deal type can only be changed in early stages (Sourcing through NDA/CIM). Current stage: ${existingStage}`,
      });
    }
    updates.dealType = d.dealType;
  }
  if (d.isActive !== undefined) updates.isActive = d.isActive;
  if (d.isConfidential !== undefined) updates.isConfidential = d.isConfidential;

  const [target] = await db.update(targetsTable).set(updates).where(eq(targetsTable.id, id)).returning();
  if (!target) return res.status(404).json({ error: "Not found" });

  const [milestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.targetId, id));
  await writeAuditEvent("deal_updated", id, d.dealOwner ?? null, {
    updatedFields: Object.keys(updates).filter((k) => k !== "updatedAt"),
    projectName: target.projectName,
  });
  return res.json(formatTarget(target, milestone ?? null));
});

// ── DELETE /api/targets/:id ───────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db.update(targetsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(targetsTable.id, id));
  return res.status(204).send();
});

// ── GET /api/targets/:id/stage-gate — must come before /:id/stage ────────────

router.get("/:id/stage-gate", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const newStage = String(req.query.newStage ?? "").trim();
  if (!newStage) return res.status(400).json({ error: "newStage query param is required" });

  const [row] = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.id, id));

  if (!row) return res.status(404).json({ error: "Not found" });

  const ctx = await fetchGateContext(id, row.target, row.milestone);
  const gateItems = evaluateGates(newStage, ctx, row.target.dealType);
  return res.json({ newStage, gateItems });
});

// ── PUT /api/targets/:id/stage — Admin or Deal Lead only ─────────────────────

router.put("/:id/stage", requireRole("Admin", "Deal Lead"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const parsed = UpdateTargetStageBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [row] = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.id, id));

  if (!row) return res.status(404).json({ error: "Not found" });

  const now = new Date();
  const previousStage = currentStage(row.milestone);
  const newStage = parsed.data.newStage;

  const CLOSURE_VERDICT_STAGES = new Set(["Closed", "Dropped"]);
  const VALID_VERDICT_ACCURACIES = new Set(["Correct", "Partially-correct", "Wrong"]);
  if (CLOSURE_VERDICT_STAGES.has(newStage)) {
    const accuracy = parsed.data.phase1VerdictAccuracy?.trim();
    if (!accuracy) return res.status(400).json({ error: "phase1VerdictAccuracy is required when closing or dropping a deal" });
    if (!VALID_VERDICT_ACCURACIES.has(accuracy)) {
      return res.status(400).json({ error: `phase1VerdictAccuracy must be one of: ${[...VALID_VERDICT_ACCURACIES].join(", ")}` });
    }
    if (newStage === "Dropped" && !parsed.data.closeReasonCode?.trim()) {
      return res.status(400).json({ error: "closeReasonCode is required when dropping a deal" });
    }
    if ((accuracy === "Partially-correct" || accuracy === "Wrong") && !parsed.data.phase1VerdictNote?.trim()) {
      return res.status(400).json({ error: "phase1VerdictNote is required when phase1VerdictAccuracy is Partially-correct or Wrong" });
    }
  }

  if (previousStage !== newStage) {
    await db.insert(stageChangeLogTable).values({
      targetId: id, previousStage, newStage,
      changedBy: parsed.data.changedBy ?? "Unknown",
      changeReason: parsed.data.changeReason ?? null,
      changedAt: now,
    });
  }

  let milestone: typeof milestonesTable.$inferSelect;
  if (row.milestone) {
    const [updatedMilestone] = await db
      .update(milestonesTable)
      .set({ currentStage: newStage, stageEnteredAt: now, updatedAt: now })
      .where(eq(milestonesTable.targetId, id))
      .returning();
    milestone = updatedMilestone;
  } else {
    const [createdMilestone] = await db
      .insert(milestonesTable)
      .values(defaultMilestoneValues(id, now, newStage))
      .returning();
    milestone = createdMilestone;
  }

  const verdictUpdate: Partial<typeof targetsTable.$inferInsert> = {};
  if (parsed.data.closeReasonCode != null) verdictUpdate.closeReasonCode = parsed.data.closeReasonCode;
  if (parsed.data.phase1VerdictAccuracy != null) verdictUpdate.phase1VerdictAccuracy = parsed.data.phase1VerdictAccuracy;
  if (parsed.data.phase1VerdictNote != null) verdictUpdate.phase1VerdictNote = parsed.data.phase1VerdictNote;
  if (parsed.data.closeMissTheme != null) verdictUpdate.closeMissTheme = parsed.data.closeMissTheme;

  const [updatedTarget] = await db
    .update(targetsTable)
    .set({ isActive: !TERMINAL_STAGES.has(newStage), updatedAt: now, ...verdictUpdate })
    .where(eq(targetsTable.id, id))
    .returning();

  const nextStage = nextPipelineStage(newStage);
  let gateWarnings: string[] = [];
  if (nextStage) {
    const ctx = await fetchGateContext(id, updatedTarget, milestone);
    const items = evaluateGates(nextStage, ctx, updatedTarget.dealType);
    gateWarnings = items.filter((g) => g.status === "unmet").map((g) => g.label);
  }

  const isRevert = previousStage && PIPELINE_STAGE_ORDER.indexOf(newStage) < PIPELINE_STAGE_ORDER.indexOf(previousStage);
  await writeAuditEvent(
    isRevert ? "stage_reverted" : "stage_advanced",
    id, parsed.data.changedBy ?? null,
    {
      previousStage, newStage, changeReason: parsed.data.changeReason ?? null, gateWarnings,
      ...(verdictUpdate.closeReasonCode != null && { closeReasonCode: verdictUpdate.closeReasonCode }),
      ...(verdictUpdate.phase1VerdictAccuracy != null && { phase1VerdictAccuracy: verdictUpdate.phase1VerdictAccuracy }),
      ...(verdictUpdate.phase1VerdictNote != null && { phase1VerdictNote: verdictUpdate.phase1VerdictNote }),
      ...(verdictUpdate.closeMissTheme != null && { closeMissTheme: verdictUpdate.closeMissTheme }),
    },
  );

  if (newStage === "Dropped") {
    await writeAuditEvent("deal_dropped", id, parsed.data.changedBy ?? null, {
      closeReasonCode: verdictUpdate.closeReasonCode ?? null,
      phase1VerdictAccuracy: verdictUpdate.phase1VerdictAccuracy ?? null,
      changeReason: parsed.data.changeReason ?? null,
    });
  }

  if (gateWarnings.length > 0 && !isRevert) {
    await writeAuditEvent("gate_overridden", id, parsed.data.changedBy ?? null, {
      newStage, unmetGates: gateWarnings, changeReason: parsed.data.changeReason ?? null,
    });
  }

  return res.json({ ...formatTarget(updatedTarget, milestone), gateWarnings });
});

// ── GET /api/targets/:id/stage-history ───────────────────────────────────────

router.get("/:id/stage-history", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(await canAccessTarget(req, id))) return res.status(404).json({ error: "Target not found" });
  const history = await db
    .select()
    .from(stageChangeLogTable)
    .where(eq(stageChangeLogTable.targetId, id))
    .orderBy(desc(stageChangeLogTable.changedAt));
  return res.json(history.map(formatStageChange));
});

// ── Per-user deal access management (Admin only) ─────────────────────────────

// GET /api/targets/:id/access — list users granted access to this target
router.get("/:id/access", requireRole("Admin"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const rows = await db
    .select({
      userId: targetAccessTable.userId,
      grantedAt: targetAccessTable.grantedAt,
      grantedBy: targetAccessTable.grantedBy,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
    })
    .from(targetAccessTable)
    .innerJoin(usersTable, eq(usersTable.id, targetAccessTable.userId))
    .where(eq(targetAccessTable.targetId, id));

  return res.json(
    rows.map((r) => ({ ...r, grantedAt: toIso(r.grantedAt) })),
  );
});

// POST /api/targets/:id/access — grant a user access to this target
router.post("/:id/access", requireRole("Admin"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [target] = await db.select({ id: targetsTable.id }).from(targetsTable).where(eq(targetsTable.id, id));
  if (!target) return res.status(404).json({ error: "Not found" });

  await grantTargetAccess(id, parsed.data.userId, req.jwtClaims?.userId ?? null);
  return res.status(201).json({ granted: true });
});

// DELETE /api/targets/:id/access/:userId — revoke a user's access to this target
router.delete("/:id/access/:userId", requireRole("Admin"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  const userId = req.params.userId as string;
  await db
    .delete(targetAccessTable)
    .where(and(eq(targetAccessTable.targetId, id), eq(targetAccessTable.userId, userId)));
  return res.status(204).send();
});

// ── Interactions & Actions sub-routers ───────────────────────────────────────

router.use("/:id/interactions", interactionsSubRouter);
router.use("/:id/actions", actionsSubRouter);

export default router;
