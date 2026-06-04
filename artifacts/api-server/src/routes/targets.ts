import { Router } from "express";
import { eq, and, ilike, or, desc, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  interactionsTable,
  actionItemsTable,
  stageChangeLogTable,
  dealDocumentsTable,
} from "@workspace/db";
import { z } from "zod";
import {
  CreateTargetBody,
  UpdateTargetBody,
  UpdateTargetStageBody,
  ListTargetsQueryParams,
  CreateInteractionBody,
  CreateActionBody,
  CreateDiligenceItemBody,
} from "@workspace/api-zod";
import { TERMINAL_STAGES } from "../constants";

const router = Router();

type TargetRow = typeof targetsTable.$inferSelect;
type MilestoneRow = typeof milestonesTable.$inferSelect | null;
type ActionRow = typeof actionItemsTable.$inferSelect;
type InteractionRow = typeof interactionsTable.$inferSelect;
type StageChangeRow = typeof stageChangeLogTable.$inferSelect;

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

// Batch-enrich a list of target rows with action counts, last interaction, and needs-attention flags.
// Per guardrails #2 and #3 for flagging logic.
async function enrichTargetRows(rows: { target: TargetRow; milestone: MilestoneRow }[]) {
  if (rows.length === 0) return [];

  const targetIds = rows.map((r) => r.target.id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fortyFiveDaysAgo = new Date(today);
  fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [allActions, allInteractions, allStageChanges] = await Promise.all([
    db.select().from(actionItemsTable).where(and(inArray(actionItemsTable.targetId, targetIds), isNull(actionItemsTable.workstream))),
    db.select().from(interactionsTable).where(inArray(interactionsTable.targetId, targetIds)),
    db
      .select()
      .from(stageChangeLogTable)
      .where(inArray(stageChangeLogTable.targetId, targetIds))
      .orderBy(desc(stageChangeLogTable.changedAt)),
  ]);

  // Group by targetId
  const actionsByTarget = new Map<number, ActionRow[]>();
  const interactionsByTarget = new Map<number, InteractionRow[]>();
  // First entry per target is the latest stage change (ordered desc)
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

    const openActions = actions.filter((a) =>
      ["Open", "In Progress", "Blocked"].includes(a.status),
    );
    const overdueActions = openActions.filter(
      (a) => a.dueDate && new Date(a.dueDate) < today,
    );

    // Most recent interaction date (interactions already fetched unsorted)
    const sortedInteractions = [...interactions].sort(
      (a, b) =>
        new Date(b.interactionDatetime).getTime() -
        new Date(a.interactionDatetime).getTime(),
    );
    const lastInteractionDate =
      sortedInteractions.length > 0
        ? toIso(sortedInteractions[0].interactionDatetime)
        : null;

    const flags: string[] = [];

    // Flag: overdue action
    if (overdueActions.length > 0) flags.push("overdue_action");

    // Flag: no recent interaction
    // Guardrail #2: only flag if (no interaction AND created > 30d ago) OR (latest interaction > 30d ago)
    const targetCreatedAt = target.createdAt ? new Date(target.createdAt) : null;
    if (interactions.length === 0) {
      if (targetCreatedAt && targetCreatedAt < thirtyDaysAgo) {
        flags.push("no_recent_interaction");
      }
    } else {
      const latestInteractionDate = new Date(sortedInteractions[0].interactionDatetime);
      if (latestInteractionDate < thirtyDaysAgo) flags.push("no_recent_interaction");
    }

    // Flag: Must-Win with no open action
    if (target.priorityTier === "Must-Win" && openActions.length === 0) {
      flags.push("must_win_no_action");
    }

    // Flag: stale stage (45+ days)
    // Guardrail #3: use stage_change_log first, fallback to milestone.stageEnteredAt, skip if neither
    if (latestStageChange) {
      if (new Date(latestStageChange.changedAt) < fortyFiveDaysAgo) {
        flags.push("stale_stage");
      }
    } else if (milestone?.stageEnteredAt) {
      if (new Date(milestone.stageEnteredAt) < fortyFiveDaysAgo) {
        flags.push("stale_stage");
      }
    }
    // If neither exists, stale_stage flag is skipped per guardrail

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

// GET /api/targets
router.get("/", async (req, res) => {
  const parsed = ListTargetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { sector, priorityTier, stage, search, isActive, owner, country, needsAttention, dealType } =
    parsed.data;

  const conditions = [];
  if (isActive !== undefined) conditions.push(eq(targetsTable.isActive, isActive));
  else conditions.push(eq(targetsTable.isActive, true));
  if (sector) conditions.push(eq(targetsTable.sector, sector));
  if (priorityTier) conditions.push(eq(targetsTable.priorityTier, priorityTier));
  if (stage) conditions.push(eq(milestonesTable.currentStage, stage));
  if (owner) conditions.push(eq(targetsTable.dealOwner, owner));
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

  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(and(...conditions))
    .orderBy(desc(targetsTable.updatedAt));

  let enriched = await enrichTargetRows(rows);

  // Apply needs-attention post-filter (enrichment required first)
  if (needsAttention) {
    enriched = enriched.filter((t) => t.needsAttention);
  }

  return res.json(enriched);
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

  // Batch enrichment for needs-attention count
  const enriched = await enrichTargetRows(active);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // recentlyUpdatedCount: targets updated in last 7 days
  // target.updatedAt is reliably set on all mutations (per guardrail #1)
  const recentlyUpdatedCount = active.filter((row) => {
    const updatedAt = row.target.updatedAt ? new Date(row.target.updatedAt) : null;
    return updatedAt && updatedAt >= sevenDaysAgo;
  }).length;

  // Reuse action data already fetched by enrichment (avoid double-fetch via summary path)
  const allActionsForSummary = await db.select().from(actionItemsTable).where(isNull(actionItemsTable.workstream));
  const openActions = allActionsForSummary.filter((a) =>
    ["Open", "In Progress", "Blocked"].includes(a.status),
  );
  const todayForOverdue = new Date();
  todayForOverdue.setHours(0, 0, 0, 0);
  const overdue = openActions.filter(
    (a) => a.dueDate && new Date(a.dueDate) < todayForOverdue,
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
    closedDealsCount: rows.filter((row) => TERMINAL_STAGES.has(currentStage(row.milestone)) && row.target.isActive).length,
    droppedDealsCount: rows.filter((row) => !row.target.isActive).length,
    avgPriorityScore: Math.round(avgScore),
    needsAttentionCount: enriched.filter((t) => t.needsAttention).length,
    recentlyUpdatedCount,
  });
});

// GET /api/targets/by-stage -- must come before /:id
router.get("/by-stage", async (_req, res) => {
  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.isActive, true));

  const counts: Record<string, number> = {};
  for (const row of rows) {
    const stage = currentStage(row.milestone);
    if (!TERMINAL_STAGES.has(stage)) {
      counts[stage] = (counts[stage] ?? 0) + 1;
    }
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
    "On Hold",
  ];

  const result = STAGE_ORDER.filter((s) => counts[s]).map((s) => ({
    stage: s,
    count: counts[s],
  }));

  // Append any stages present in data that aren't in STAGE_ORDER (future-proof)
  for (const [stage, count] of Object.entries(counts)) {
    if (!STAGE_ORDER.includes(stage)) {
      result.push({ stage, count });
    }
  }

  return res.json(result);
});

// GET /api/targets/top-priority -- must come before /:id
router.get("/top-priority", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "5"), 10), 20);
  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.isActive, true));

  const ranked = rows
    .filter((row) => !TERMINAL_STAGES.has(currentStage(row.milestone)))
    .map((row) => ({
      target: row.target,
      milestone: row.milestone,
      priorityScore: calcPriorityScore(row.target),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
    .map((row) => formatTarget(row.target, row.milestone));

  return res.json(ranked);
});

// GET /api/targets/filter-options -- must come before /:id
// Returns distinct non-null owners and countries from all active targets
// for populating filter dropdowns (guardrail #5: unfiltered, stable options)
router.get("/filter-options", async (_req, res) => {
  const rows = await db
    .select({ dealOwner: targetsTable.dealOwner, country: targetsTable.country })
    .from(targetsTable)
    .where(eq(targetsTable.isActive, true));

  const owners = [
    ...new Set(rows.map((r) => r.dealOwner).filter((v): v is string => v !== null)),
  ].sort();
  const countries = [
    ...new Set(rows.map((r) => r.country).filter((v): v is string => v !== null)),
  ].sort();

  return res.json({ owners, countries });
});

// GET /api/targets/needs-attention -- must come before /:id
router.get("/needs-attention", async (_req, res) => {
  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.isActive, true));

  // Only flag active, non-terminal opportunities
  const activeRows = rows.filter(
    (row) => !TERMINAL_STAGES.has(currentStage(row.milestone)),
  );

  const enriched = await enrichTargetRows(activeRows);
  return res.json(enriched.filter((t) => t.needsAttention));
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
  if (d.financialAttractivenessScore !== undefined)
    updates.financialAttractivenessScore = d.financialAttractivenessScore;
  if (d.processMaturityScore !== undefined) updates.processMaturityScore = d.processMaturityScore;
  if (d.riskPenaltyScore !== undefined) updates.riskPenaltyScore = d.riskPenaltyScore;
  if (d.dealType !== undefined) updates.dealType = d.dealType;
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

// GET /api/targets/:id/actions — regular actions only (workstream IS NULL)
router.get("/:id/actions", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const actions = await db
    .select()
    .from(actionItemsTable)
    .where(and(eq(actionItemsTable.targetId, id), isNull(actionItemsTable.workstream)))
    .orderBy(desc(actionItemsTable.createdAt));

  return res.json(actions.map(formatAction));
});

// POST /api/targets/:id/actions
router.post("/:id/actions", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
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
      dueDate: d.dueDate ? d.dueDate.toISOString().split("T")[0] : null,
      priority: d.priority ?? "Medium",
      status: "Open",
      workstream: null,
      notes: d.notes ?? null,
      createdAt: now,
    })
    .returning();

  await db
    .update(targetsTable)
    .set({ updatedAt: now })
    .where(eq(targetsTable.id, targetId));

  return res.status(201).json(formatAction(action));
});

// GET /api/targets/:id/diligence — per-target diligence tab data
router.get("/:id/diligence", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items = await db
    .select()
    .from(actionItemsTable)
    .where(and(eq(actionItemsTable.targetId, id), isNotNull(actionItemsTable.workstream)));

  const total = items.length;
  const completed = items.filter((i) => i.status === "Completed").length;
  const blocked = items.filter((i) => i.status === "Blocked").length;
  const overdue = items.filter(
    (i) => i.status !== "Completed" && i.dueDate && new Date(i.dueDate) < today,
  ).length;

  const WORKSTREAMS = ["Commercial", "Financial", "Legal", "Tax", "HR", "Technology", "Operations", "Integration", "ESG", "Regulatory"];
  const presentWorkstreams = new Set(items.map((i) => i.workstream!));
  const missingWorkstreams = WORKSTREAMS.filter((w) => !presentWorkstreams.has(w));

  return res.json({
    items: items.map(formatAction),
    readiness: { total, completed, blocked, overdue, missingWorkstreams },
  });
});

// GET /api/targets/:id/documents — list docs for a target
router.get("/:id/documents", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const docs = await db
    .select()
    .from(dealDocumentsTable)
    .where(eq(dealDocumentsTable.targetId, targetId))
    .orderBy(desc(dealDocumentsTable.createdAt));
  return res.json(
    docs.map((d) => ({
      ...d,
      documentDate: d.documentDate ? String(d.documentDate).slice(0, 10) : null,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : new Date(d.createdAt).toISOString(),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : new Date(d.updatedAt).toISOString(),
    })),
  );
});

const CreateDocumentBodySchema = z.object({
  title: z.string().min(1),
  documentType: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  workstream: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// POST /api/targets/:id/documents — create a document record
router.post("/:id/documents", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const parsed = CreateDocumentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();
  const [doc] = await db
    .insert(dealDocumentsTable)
    .values({
      targetId,
      title: d.title,
      documentType: d.documentType ?? "Other",
      status: d.status ?? "Requested",
      owner: d.owner ?? null,
      documentDate: d.documentDate ?? null,
      url: d.url ?? null,
      workstream: d.workstream ?? null,
      notes: d.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return res.status(201).json({
    ...doc,
    documentDate: doc.documentDate ? String(doc.documentDate).slice(0, 10) : null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date(doc.createdAt).toISOString(),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : new Date(doc.updatedAt).toISOString(),
  });
});

// POST /api/targets/:id/diligence — create a diligence item for a target
router.post("/:id/diligence", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const parsed = CreateDiligenceItemBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();

  const [item] = await db
    .insert(actionItemsTable)
    .values({
      targetId,
      description: d.description,
      workstream: d.workstream,
      owner: d.owner ?? null,
      dueDate: d.dueDate ? d.dueDate.toISOString().split("T")[0] : null,
      priority: d.priority ?? "Medium",
      status: d.status ?? "Open",
      notes: d.notes ?? null,
      evidenceLinks: d.evidenceLinks ?? null,
      createdAt: now,
    })
    .returning();

  await db
    .update(targetsTable)
    .set({ updatedAt: now })
    .where(eq(targetsTable.id, targetId));

  return res.status(201).json(formatAction(item));
});

export default router;
