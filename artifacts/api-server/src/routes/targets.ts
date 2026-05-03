import { Router } from "express";
import { eq, and, ilike, or, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  interactionsTable,
  actionItemsTable,
  stageChangeLogTable,
} from "@workspace/db";
import {
  CreateTargetBody,
  UpdateTargetBody,
  UpdateTargetStageBody,
  ListTargetsQueryParams,
} from "@workspace/api-zod";

const router = Router();

type TargetRow = typeof targetsTable.$inferSelect;
type MilestoneRow = typeof milestonesTable.$inferSelect | null;
type ActionRow = typeof actionItemsTable.$inferSelect;
type InteractionRow = typeof interactionsTable.$inferSelect;
type StageChangeRow = typeof stageChangeLogTable.$inferSelect;

const TERMINAL_STAGES = new Set(["Closed", "Dropped"]);

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toDateString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function currentStage(milestone: MilestoneRow): string {
  return milestone?.currentStage ?? "Sourcing";
}

function calcPriorityScore(t: {
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

function formatTarget(t: TargetRow, milestone: MilestoneRow = null) {
  return {
    ...t,
    currentStage: currentStage(milestone),
    priorityScore: calcPriorityScore(t),
    createdAt: toIso(t.createdAt),
    updatedAt: toIso(t.updatedAt),
  };
}

function formatInteraction(i: InteractionRow) {
  return {
    ...i,
    interactionDatetime: toIso(i.interactionDatetime),
    createdAt: toIso(i.createdAt),
  };
}

function formatAction(a: ActionRow) {
  return {
    ...a,
    dueDate: toDateString(a.dueDate),
    createdAt: toIso(a.createdAt),
    completedAt: toIso(a.completedAt),
  };
}

function formatStageChange(s: StageChangeRow) {
  return {
    ...s,
    changedAt: toIso(s.changedAt),
  };
}

function defaultMilestoneValues(targetId: number, now: Date, currentStageValue = "Sourcing") {
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

// GET /api/targets
router.get("/", async (req, res) => {
  const parsed = ListTargetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { sector, priorityTier, stage, search, isActive } = parsed.data;

  const conditions = [];
  if (isActive !== undefined) conditions.push(eq(targetsTable.isActive, isActive));
  else conditions.push(eq(targetsTable.isActive, true));
  if (sector) conditions.push(eq(targetsTable.sector, sector));
  if (priorityTier) conditions.push(eq(targetsTable.priorityTier, priorityTier));
  if (stage) conditions.push(eq(milestonesTable.currentStage, stage));
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

  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(and(...conditions))
    .orderBy(desc(targetsTable.updatedAt));

  return res.json(rows.map((row) => formatTarget(row.target, row.milestone)));
});

// POST /api/targets
router.post("/", async (req, res) => {
  const parsed = CreateTargetBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
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

  return res.status(201).json(formatTarget(target, milestone));
});

// GET /api/targets/summary -- must come before /:id
router.get("/summary", async (_req, res) => {
  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id));

  const active = rows.filter((row) => {
    const stage = currentStage(row.milestone);
    return row.target.isActive && !TERMINAL_STAGES.has(stage);
  });

  const allActions = await db.select().from(actionItemsTable);
  const openActions = allActions.filter((a) =>
    ["Open", "In Progress", "Blocked"].includes(a.status),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = openActions.filter(
    (a) => a.dueDate && new Date(a.dueDate) < today,
  );

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
    closedDealsCount: rows.filter((row) => currentStage(row.milestone) === "Closed").length,
    droppedDealsCount: rows.filter((row) => currentStage(row.milestone) === "Dropped" || !row.target.isActive).length,
    avgPriorityScore: Math.round(avgScore),
  });
});

// GET /api/targets/by-stage
router.get("/by-stage", async (_req, res) => {
  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.isActive, true));

  const counts: Record<string, number> = {};
  for (const row of rows) {
    const stage = currentStage(row.milestone);
    counts[stage] = (counts[stage] ?? 0) + 1;
  }

  const STAGE_ORDER = [
    "Sourcing",
    "Outreach",
    "Introductory Discussion",
    "NDA / CIM",
    "Preliminary Due Diligence",
    "Management Meeting",
    "Non-Binding Offer",
    "Confirmatory Due Diligence",
    "Binding Offer",
    "SPA Negotiation",
    "Integration Planning",
    "Closed",
    "On Hold",
    "Dropped",
  ];

  const result = STAGE_ORDER.filter((s) => counts[s]).map((s) => ({
    stage: s,
    count: counts[s],
  }));

  return res.json(result);
});

// GET /api/targets/top-priority
router.get("/top-priority", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "5"), 10), 20);
  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.isActive, true));

  const ranked = rows
    .map((row) => ({ target: row.target, milestone: row.milestone, priorityScore: calcPriorityScore(row.target) }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
    .map((row) => formatTarget(row.target, row.milestone));

  return res.json(ranked);
});

// GET /api/targets/:id
router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [row] = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.id, id));

  if (!row) return res.status(404).json({ error: "Not found" });

  const [interactions, actions, stageHistory] = await Promise.all([
    db
      .select()
      .from(interactionsTable)
      .where(eq(interactionsTable.targetId, id))
      .orderBy(desc(interactionsTable.interactionDatetime)),
    db
      .select()
      .from(actionItemsTable)
      .where(eq(actionItemsTable.targetId, id))
      .orderBy(desc(actionItemsTable.createdAt)),
    db
      .select()
      .from(stageChangeLogTable)
      .where(eq(stageChangeLogTable.targetId, id))
      .orderBy(desc(stageChangeLogTable.changedAt)),
  ]);

  return res.json({
    ...formatTarget(row.target, row.milestone),
    interactions: interactions.map(formatInteraction),
    actions: actions.map(formatAction),
    stageHistory: stageHistory.map(formatStageChange),
  });
});

// PUT /api/targets/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const parsed = UpdateTargetBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updates: Partial<typeof targetsTable.$inferInsert> = {
    updatedAt: new Date(),
  };
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
  if (d.isActive !== undefined) updates.isActive = d.isActive;
  if (d.isConfidential !== undefined) updates.isConfidential = d.isConfidential;

  const [target] = await db
    .update(targetsTable)
    .set(updates)
    .where(eq(targetsTable.id, id))
    .returning();

  if (!target) return res.status(404).json({ error: "Not found" });

  const [milestone] = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.targetId, id));

  return res.json(formatTarget(target, milestone ?? null));
});

// DELETE /api/targets/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db
    .update(targetsTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(targetsTable.id, id));
  return res.status(204).send();
});

// PUT /api/targets/:id/stage
router.put("/:id/stage", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const parsed = UpdateTargetStageBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const [row] = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.id, id));

  if (!row) return res.status(404).json({ error: "Not found" });

  const now = new Date();
  const previousStage = currentStage(row.milestone);
  const newStage = parsed.data.newStage;

  if (previousStage !== newStage) {
    await db.insert(stageChangeLogTable).values({
      targetId: id,
      previousStage,
      newStage,
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

  const [updatedTarget] = await db
    .update(targetsTable)
    .set({
      isActive: !TERMINAL_STAGES.has(newStage),
      updatedAt: now,
    })
    .where(eq(targetsTable.id, id))
    .returning();

  return res.json(formatTarget(updatedTarget, milestone));
});

// GET /api/targets/:id/stage-history
router.get("/:id/stage-history", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const history = await db
    .select()
    .from(stageChangeLogTable)
    .where(eq(stageChangeLogTable.targetId, id))
    .orderBy(desc(stageChangeLogTable.changedAt));

  return res.json(history.map(formatStageChange));
});

// GET /api/targets/:id/interactions
router.get("/:id/interactions", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const interactions = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.targetId, id))
    .orderBy(desc(interactionsTable.interactionDatetime));

  return res.json(interactions.map(formatInteraction));
});

// POST /api/targets/:id/interactions
router.post("/:id/interactions", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const { CreateInteractionBody } = await import("@workspace/api-zod");
  const parsed = CreateInteractionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();
  const [interaction] = await db
    .insert(interactionsTable)
    .values({
      targetId,
      interactionType: d.interactionType,
      summary: d.summary,
      participantsInternal: d.participantsInternal ?? null,
      participantsExternal: d.participantsExternal ?? null,
      sentiment: d.sentiment ?? null,
      promoterWillingness: d.promoterWillingness ?? null,
      valuationSignal: d.valuationSignal ?? null,
      createdBy: d.createdBy ?? null,
      interactionDatetime: d.interactionDatetime ? new Date(d.interactionDatetime) : now,
      createdAt: now,
    })
    .returning();

  await db
    .update(targetsTable)
    .set({ updatedAt: now })
    .where(eq(targetsTable.id, targetId));

  return res.status(201).json(formatInteraction(interaction));
});

// GET /api/targets/:id/actions
router.get("/:id/actions", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const actions = await db
    .select()
    .from(actionItemsTable)
    .where(eq(actionItemsTable.targetId, id))
    .orderBy(desc(actionItemsTable.createdAt));

  return res.json(actions.map(formatAction));
});

// POST /api/targets/:id/actions
router.post("/:id/actions", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const { CreateActionBody } = await import("@workspace/api-zod");
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
      dueDate: d.dueDate ?? null,
      priority: d.priority ?? "Medium",
      status: "Open",
      createdAt: now,
    })
    .returning();

  await db
    .update(targetsTable)
    .set({ updatedAt: now })
    .where(eq(targetsTable.id, targetId));

  return res.status(201).json(formatAction(action));
});

export default router;
