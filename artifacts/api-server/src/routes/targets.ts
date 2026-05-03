import { Router } from "express";
import { eq, and, ilike, or, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
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

function formatTarget(t: typeof targetsTable.$inferSelect) {
  return {
    ...t,
    priorityScore: calcPriorityScore(t),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
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
  if (stage) conditions.push(eq(targetsTable.currentStage, stage));
  if (search) {
    conditions.push(
      or(
        ilike(targetsTable.projectName, `%${search}%`),
        ilike(targetsTable.targetCode, `%${search}%`),
        ilike(targetsTable.country, `%${search}%`),
        ilike(targetsTable.sector, `%${search}%`),
      )!,
    );
  }

  const targets = await db
    .select()
    .from(targetsTable)
    .where(and(...conditions))
    .orderBy(desc(targetsTable.updatedAt));

  return res.json(targets.map(formatTarget));
});

// POST /api/targets
router.post("/", async (req, res) => {
  const parsed = CreateTargetBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

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
      isConfidential: data.isConfidential ?? true,
      currentStage: "Sourcing",
    })
    .returning();

  await db.insert(stageChangeLogTable).values({
    targetId: target.id,
    previousStage: null,
    newStage: "Sourcing",
    changedBy: data.dealOwner ?? "System",
    changeReason: "Initial opportunity creation",
  });

  return res.status(201).json(formatTarget(target));
});

// GET /api/targets/summary — must come before /:id
router.get("/summary", async (_req, res) => {
  const allTargets = await db.select().from(targetsTable);
  const active = allTargets.filter((t) => t.isActive);
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
      ? active.reduce((sum, t) => sum + calcPriorityScore(t), 0) / active.length
      : 0;

  return res.json({
    activeTargets: active.length,
    mustWinCount: active.filter((t) => t.priorityTier === "Must-Win").length,
    priority1Count: active.filter((t) => t.priorityTier === "Priority 1").length,
    openActionsCount: openActions.length,
    overdueActionsCount: overdue.length,
    closedDealsCount: allTargets.filter((t) => t.currentStage === "Closed").length,
    droppedDealsCount: allTargets.filter((t) => t.currentStage === "Dropped" || !t.isActive).length,
    avgPriorityScore: Math.round(avgScore),
  });
});

// GET /api/targets/by-stage
router.get("/by-stage", async (_req, res) => {
  const targets = await db
    .select()
    .from(targetsTable)
    .where(eq(targetsTable.isActive, true));

  const counts: Record<string, number> = {};
  for (const t of targets) {
    counts[t.currentStage] = (counts[t.currentStage] ?? 0) + 1;
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
  const targets = await db
    .select()
    .from(targetsTable)
    .where(eq(targetsTable.isActive, true));

  const ranked = targets
    .map((t) => ({ ...t, priorityScore: calcPriorityScore(t) }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
    .map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

  return res.json(ranked);
});

// GET /api/targets/:id
router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db
    .select()
    .from(targetsTable)
    .where(eq(targetsTable.id, id));

  if (!target) return res.status(404).json({ error: "Not found" });

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
    ...formatTarget(target),
    interactions: interactions.map((i) => ({
      ...i,
      interactionDatetime: i.interactionDatetime.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
    actions: actions.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
    stageHistory: stageHistory.map((s) => ({
      ...s,
      changedAt: s.changedAt.toISOString(),
    })),
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
  return res.json(formatTarget(target));
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

  const [current] = await db
    .select()
    .from(targetsTable)
    .where(eq(targetsTable.id, id));

  if (!current) return res.status(404).json({ error: "Not found" });

  if (current.currentStage !== parsed.data.newStage) {
    await db.insert(stageChangeLogTable).values({
      targetId: id,
      previousStage: current.currentStage,
      newStage: parsed.data.newStage,
      changedBy: parsed.data.changedBy ?? "Unknown",
      changeReason: parsed.data.changeReason ?? null,
    });
  }

  const [updated] = await db
    .update(targetsTable)
    .set({ currentStage: parsed.data.newStage, updatedAt: new Date() })
    .where(eq(targetsTable.id, id))
    .returning();

  return res.json(formatTarget(updated));
});

// GET /api/targets/:id/stage-history
router.get("/:id/stage-history", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const history = await db
    .select()
    .from(stageChangeLogTable)
    .where(eq(stageChangeLogTable.targetId, id))
    .orderBy(desc(stageChangeLogTable.changedAt));

  return res.json(
    history.map((h) => ({ ...h, changedAt: h.changedAt.toISOString() })),
  );
});

// GET /api/targets/:id/interactions
router.get("/:id/interactions", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const interactions = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.targetId, id))
    .orderBy(desc(interactionsTable.interactionDatetime));

  return res.json(
    interactions.map((i) => ({
      ...i,
      interactionDatetime: i.interactionDatetime.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
  );
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
      interactionDatetime: d.interactionDatetime ? new Date(d.interactionDatetime) : new Date(),
    })
    .returning();

  await db
    .update(targetsTable)
    .set({ updatedAt: new Date() })
    .where(eq(targetsTable.id, targetId));

  return res.status(201).json({
    ...interaction,
    interactionDatetime: interaction.interactionDatetime.toISOString(),
    createdAt: interaction.createdAt.toISOString(),
  });
});

// GET /api/targets/:id/actions
router.get("/:id/actions", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const actions = await db
    .select()
    .from(actionItemsTable)
    .where(eq(actionItemsTable.targetId, id))
    .orderBy(desc(actionItemsTable.createdAt));

  return res.json(
    actions.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
  );
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
    })
    .returning();

  await db
    .update(targetsTable)
    .set({ updatedAt: new Date() })
    .where(eq(targetsTable.id, targetId));

  return res.status(201).json({
    ...action,
    createdAt: action.createdAt.toISOString(),
    completedAt: null,
  });
});

export default router;
