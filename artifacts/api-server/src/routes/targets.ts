import { Router } from "express";
import { eq, and, ilike, or, desc, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  interactionsTable,
  actionItemsTable,
  stageChangeLogTable,
  dealDocumentsTable,
  icSessionsTable,
  valuationsTable,
  dealEconomicsTable,
  synergiesTable,
  dealAdvisorsTable,
  dealSponsorsTable,
  ndaRecordsTable,
  regulatoryClearancesTable,
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
import { TERMINAL_STAGES, PIPELINE_STAGE_ORDER, getStagesForDealType } from "../constants";
import { writeAuditEvent } from "./audit";

const router = Router();

type TargetRow = typeof targetsTable.$inferSelect;
type MilestoneRow = typeof milestonesTable.$inferSelect | null;
type ActionRow = typeof actionItemsTable.$inferSelect;
type InteractionRow = typeof interactionsTable.$inferSelect;
type StageChangeRow = typeof stageChangeLogTable.$inferSelect;
type DocumentRow = typeof dealDocumentsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Stage Gate Enforcement
// ---------------------------------------------------------------------------

type GateStatus = "met" | "unmet" | "na";
interface GateItem {
  label: string;
  status: GateStatus;
  detail?: string;
}

type GateContext = {
  target: TargetRow;
  milestone: MilestoneRow;
  interactions: InteractionRow[];
  diligenceItems: ActionRow[];
  documents: DocumentRow[];
};

type GateCheckFn = (ctx: GateContext) => GateItem;

// Ordered pipeline stages (non-terminal only) for "next stage" lookup
const PIPELINE_STAGE_SEQUENCE = [
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
];

// Gate requirements map — keys are the stage you're trying to ENTER
const STAGE_GATE_REQUIREMENTS: Record<string, GateCheckFn[]> = {
  "NDA / CIM": [
    (ctx) => {
      const hasNda = ctx.documents.some(
        (d) =>
          d.documentType?.toLowerCase().includes("nda") ||
          d.title?.toLowerCase().includes("nda"),
      );
      return {
        label: "NDA initiated",
        status: hasNda ? "met" : "unmet",
        detail: hasNda
          ? "NDA document found in vault"
          : "No NDA document found — add to Document Vault",
      };
    },
  ],

  "Preliminary Due Diligence": [
    (ctx) => {
      const ndaExecuted = ctx.documents.some(
        (d) =>
          (d.documentType?.toLowerCase().includes("nda") ||
            d.title?.toLowerCase().includes("nda")) &&
          ["Received", "Executed", "Approved"].includes(d.status ?? ""),
      );
      return {
        label: "NDA executed",
        status: ndaExecuted ? "met" : "unmet",
        detail: ndaExecuted
          ? "NDA marked as Received/Executed"
          : "NDA not yet executed — update status in Document Vault",
      };
    },
    (ctx) => {
      const hasCim = ctx.documents.some(
        (d) =>
          d.documentType?.toLowerCase().includes("cim") ||
          d.title?.toLowerCase().includes("cim") ||
          d.title?.toLowerCase().includes("information memorandum"),
      );
      return {
        label: "CIM / Information Memorandum received",
        status: hasCim ? "met" : "unmet",
        detail: hasCim
          ? "CIM found in vault"
          : "No CIM/Information Memorandum logged",
      };
    },
  ],

  "Non-Binding Offer": [
    (ctx) => {
      const hasMgmtMeeting = ctx.interactions.some(
        (i) =>
          i.interactionType?.toLowerCase().includes("management") ||
          i.interactionType?.toLowerCase().includes("meeting") ||
          i.summary?.toLowerCase().includes("management meeting"),
      );
      return {
        label: "Management meeting logged",
        status: hasMgmtMeeting ? "met" : "unmet",
        detail: hasMgmtMeeting
          ? "Management meeting interaction found"
          : "No management meeting interaction logged",
      };
    },
  ],

  "Confirmatory Due Diligence": [
    (ctx) => {
      const hasNbo = ctx.documents.some(
        (d) =>
          d.documentType?.toLowerCase().includes("nbo") ||
          d.documentType?.toLowerCase().includes("non-binding") ||
          d.documentType?.toLowerCase().includes("letter of intent") ||
          d.documentType?.toLowerCase().includes("loi") ||
          d.title?.toLowerCase().includes("non-binding offer") ||
          d.title?.toLowerCase().includes("loi") ||
          d.title?.toLowerCase().includes("letter of intent"),
      );
      return {
        label: "Non-binding offer / LOI on file",
        status: hasNbo ? "met" : "unmet",
        detail: hasNbo
          ? "NBO/LOI document found"
          : "No Non-Binding Offer or LOI in Document Vault",
      };
    },
  ],

  "Binding Offer": [
    (ctx) => {
      const items = ctx.diligenceItems.filter(
        (i) => i.workstream?.toLowerCase() === "financial",
      );
      if (items.length === 0) {
        return {
          label: "Financial diligence workstream",
          status: "unmet",
          detail: "No financial diligence items found — add to Diligence Workspace",
        };
      }
      const completed = items.filter((i) => i.status === "Completed").length;
      const pct = Math.round((completed / items.length) * 100);
      return {
        label: "Financial diligence workstream",
        status: pct >= 50 ? "met" : "unmet",
        detail: `${completed}/${items.length} items complete (${pct}%)`,
      };
    },
    (ctx) => {
      const items = ctx.diligenceItems.filter(
        (i) => i.workstream?.toLowerCase() === "legal",
      );
      if (items.length === 0) {
        return {
          label: "Legal diligence workstream",
          status: "unmet",
          detail: "No legal diligence items found — add to Diligence Workspace",
        };
      }
      const completed = items.filter((i) => i.status === "Completed").length;
      const pct = Math.round((completed / items.length) * 100);
      return {
        label: "Legal diligence workstream",
        status: pct >= 50 ? "met" : "unmet",
        detail: `${completed}/${items.length} items complete (${pct}%)`,
      };
    },
  ],

  "SPA Negotiation": [
    (ctx) => {
      const coreWs = ["financial", "legal", "tax"];
      const items = ctx.diligenceItems.filter((i) =>
        coreWs.includes(i.workstream?.toLowerCase() ?? ""),
      );
      if (items.length === 0) {
        return {
          label: "Confirmatory due diligence complete",
          status: "unmet",
          detail: "No confirmatory DD items found (Financial/Legal/Tax)",
        };
      }
      const completed = items.filter((i) => i.status === "Completed").length;
      const pct = Math.round((completed / items.length) * 100);
      return {
        label: "Confirmatory due diligence complete",
        status: pct >= 80 ? "met" : "unmet",
        detail: `${completed}/${items.length} core DD items complete (${pct}% — need 80%)`,
      };
    },
    (ctx) => {
      const hasBindingOffer = ctx.documents.some(
        (d) =>
          d.documentType?.toLowerCase().includes("binding") ||
          d.title?.toLowerCase().includes("binding offer") ||
          d.title?.toLowerCase().includes("spa") ||
          d.title?.toLowerCase().includes("share purchase"),
      );
      return {
        label: "Binding offer / SPA draft on file",
        status: hasBindingOffer ? "met" : "unmet",
        detail: hasBindingOffer
          ? "Binding offer or SPA draft found"
          : "No binding offer or SPA draft in Document Vault",
      };
    },
  ],

  Closed: [
    (ctx) => {
      const hasBindingOffer = ctx.documents.some(
        (d) =>
          d.documentType?.toLowerCase().includes("binding") ||
          d.title?.toLowerCase().includes("binding offer"),
      );
      return {
        label: "Binding offer on file",
        status: hasBindingOffer ? "met" : "unmet",
        detail: hasBindingOffer
          ? "Binding offer found"
          : "No binding offer in Document Vault",
      };
    },
    (ctx) => {
      const hasSpa = ctx.documents.some(
        (d) =>
          d.title?.toLowerCase().includes("spa") ||
          d.title?.toLowerCase().includes("share purchase") ||
          d.documentType?.toLowerCase().includes("spa"),
      );
      return {
        label: "SPA / transaction agreement signed",
        status: hasSpa ? "met" : "unmet",
        detail: hasSpa
          ? "SPA document found"
          : "No SPA/transaction agreement in Document Vault",
      };
    },
  ],
};

function nextPipelineStage(stage: string): string | null {
  const idx = PIPELINE_STAGE_SEQUENCE.indexOf(stage);
  if (idx === -1 || idx >= PIPELINE_STAGE_SEQUENCE.length - 1) return null;
  return PIPELINE_STAGE_SEQUENCE[idx + 1];
}

function evaluateGates(stage: string, ctx: GateContext, dealType?: string | null): GateItem[] {
  const checks = STAGE_GATE_REQUIREMENTS[stage];
  if (!checks || checks.length === 0) return [];

  // If the target stage is not in the applicable stage list for this deal type,
  // return all gate items as "na" so the UI can signal they don't apply.
  const applicableStages = getStagesForDealType(dealType);
  if (!applicableStages.includes(stage)) {
    return checks.map((fn) => {
      const item = fn(ctx);
      return {
        ...item,
        status: "na" as GateStatus,
        detail: `Not applicable for ${dealType ?? "this"} deal type`,
      };
    });
  }

  return checks.map((fn) => fn(ctx));
}

async function fetchGateContext(
  targetId: number,
  target: TargetRow,
  milestone: MilestoneRow,
): Promise<GateContext> {
  const [interactions, diligenceItems, documents] = await Promise.all([
    db.select().from(interactionsTable).where(eq(interactionsTable.targetId, targetId)),
    db
      .select()
      .from(actionItemsTable)
      .where(and(eq(actionItemsTable.targetId, targetId), isNotNull(actionItemsTable.workstream))),
    db.select().from(dealDocumentsTable).where(eq(dealDocumentsTable.targetId, targetId)),
  ]);
  return { target, milestone, interactions, diligenceItems, documents };
}

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

  await writeAuditEvent("deal_created", target.id, data.dealOwner ?? null, {
    targetCode: target.targetCode,
    projectName: target.projectName,
    dealType: target.dealType,
    initialStage: "Sourcing",
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
    .select({
      dealOwner: targetsTable.dealOwner,
      country: targetsTable.country,
      sector: targetsTable.sector,
      dealType: targetsTable.dealType,
    })
    .from(targetsTable);

  const owners = [
    ...new Set(rows.map((r) => r.dealOwner).filter((v): v is string => v !== null)),
  ].sort();
  const countries = [
    ...new Set(rows.map((r) => r.country).filter((v): v is string => v !== null)),
  ].sort();
  const sectors = [
    ...new Set(rows.map((r) => r.sector).filter((v): v is string => v !== null)),
  ].sort();
  const dealTypes = [
    ...new Set(rows.map((r) => r.dealType).filter((v): v is string => v !== null)),
  ].sort();

  return res.json({ owners, countries, sectors, dealTypes });
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

  // Fetch current state before applying updates (needed for deal-type change guard)
  const [existingRow] = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.id, id));

  if (!existingRow) return res.status(404).json({ error: "Not found" });

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
  if (d.dealType !== undefined) {
    // Only allow deal-type changes when the deal is still in early stages.
    // If the current stage is past NDA/CIM, reject the change.
    const DEAL_TYPE_EARLY_STAGES = new Set([
      "Sourcing",
      "Outreach",
      "Introductory Discussion",
      "NDA / CIM",
    ]);
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

// GET /api/targets/:id/stage-gate?newStage=X  (must come before /:id/stage PUT)
router.get("/:id/stage-gate", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const newStage = String(req.query.newStage ?? "").trim();
  if (!newStage) {
    return res.status(400).json({ error: "newStage query param is required" });
  }

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

  const verdictUpdate: Partial<typeof targetsTable.$inferInsert> = {};
  if (parsed.data.closeReasonCode !== undefined && parsed.data.closeReasonCode !== null) {
    verdictUpdate.closeReasonCode = parsed.data.closeReasonCode;
  }
  if (parsed.data.phase1VerdictAccuracy !== undefined && parsed.data.phase1VerdictAccuracy !== null) {
    verdictUpdate.phase1VerdictAccuracy = parsed.data.phase1VerdictAccuracy;
  }
  if (parsed.data.phase1VerdictNote !== undefined && parsed.data.phase1VerdictNote !== null) {
    verdictUpdate.phase1VerdictNote = parsed.data.phase1VerdictNote;
  }
  if (parsed.data.closeMissTheme !== undefined && parsed.data.closeMissTheme !== null) {
    verdictUpdate.closeMissTheme = parsed.data.closeMissTheme;
  }

  const [updatedTarget] = await db
    .update(targetsTable)
    .set({
      isActive: !TERMINAL_STAGES.has(newStage),
      updatedAt: now,
      ...verdictUpdate,
    })
    .where(eq(targetsTable.id, id))
    .returning();

  // Advisory gate warnings: evaluate gates for the next stage after newStage
  // so the team knows what's needed for the next move.
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
    id,
    parsed.data.changedBy ?? null,
    {
      previousStage,
      newStage,
      changeReason: parsed.data.changeReason ?? null,
      gateWarnings,
    },
  );

  return res.json({ ...formatTarget(updatedTarget, milestone), gateWarnings });
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

// GET /api/targets/:id/activity — unified activity feed (reverse-chron, max 200)
router.get("/:id/activity", async (req, res) => {
  const id = parseInt(req.params.id, 10);

  const [stageChanges, interactions, allActions, completedDiligence, documents] =
    await Promise.all([
      db
        .select()
        .from(stageChangeLogTable)
        .where(eq(stageChangeLogTable.targetId, id))
        .orderBy(desc(stageChangeLogTable.changedAt)),
      db
        .select()
        .from(interactionsTable)
        .where(eq(interactionsTable.targetId, id))
        .orderBy(desc(interactionsTable.interactionDatetime)),
      db
        .select()
        .from(actionItemsTable)
        .where(
          and(
            eq(actionItemsTable.targetId, id),
            isNull(actionItemsTable.workstream),
          ),
        )
        .orderBy(desc(actionItemsTable.createdAt)),
      db
        .select()
        .from(actionItemsTable)
        .where(
          and(
            eq(actionItemsTable.targetId, id),
            eq(actionItemsTable.status, "Completed"),
            isNotNull(actionItemsTable.workstream),
          ),
        )
        .orderBy(desc(actionItemsTable.completedAt)),
      db
        .select()
        .from(dealDocumentsTable)
        .where(eq(dealDocumentsTable.targetId, id))
        .orderBy(desc(dealDocumentsTable.createdAt)),
    ]);

  type ActivityEvent = {
    type: string;
    timestamp: string;
    title: string;
    detail: string | null;
  };

  const events: ActivityEvent[] = [];

  for (const sc of stageChanges) {
    const ts = toIso(sc.changedAt);
    if (!ts) continue;
    events.push({
      type: "stage_changed",
      timestamp: ts,
      title: sc.previousStage
        ? `Stage changed: ${sc.previousStage} → ${sc.newStage}`
        : `Added to pipeline at ${sc.newStage}`,
      detail: sc.changeReason ?? null,
    });
  }

  for (const inter of interactions) {
    const ts = toIso(inter.interactionDatetime);
    if (!ts) continue;
    events.push({
      type: "interaction",
      timestamp: ts,
      title: `${inter.interactionType ?? "Interaction"} logged`,
      detail: inter.summary ? inter.summary.slice(0, 120) : null,
    });
  }

  for (const action of allActions) {
    const createdTs = toIso(action.createdAt);
    if (createdTs) {
      events.push({
        type: "action_created",
        timestamp: createdTs,
        title: `Action added: ${action.description}`,
        detail: action.owner ? `Owner: ${action.owner}` : null,
      });
    }
    if (action.status === "Completed") {
      const completedTs = toIso(action.completedAt) ?? toIso(action.createdAt);
      if (completedTs) {
        events.push({
          type: "action_completed",
          timestamp: completedTs,
          title: `Action completed: ${action.description}`,
          detail: action.owner ? `Owner: ${action.owner}` : null,
        });
      }
    }
  }

  for (const item of completedDiligence) {
    const ts = toIso(item.completedAt) ?? toIso(item.createdAt);
    if (!ts) continue;
    events.push({
      type: "diligence_completed",
      timestamp: ts,
      title: `Diligence item completed: ${item.description}`,
      detail: item.workstream ? `Workstream: ${item.workstream}` : null,
    });
  }

  for (const doc of documents) {
    const ts = toIso(doc.uploadedAt) ?? toIso(doc.createdAt);
    if (!ts) continue;
    events.push({
      type: "document_uploaded",
      timestamp: ts,
      title: `Document added: ${doc.title}`,
      detail: doc.documentType !== "Other" ? doc.documentType : null,
    });
  }

  // Sort descending by timestamp, limit to 200
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return res.json(events.slice(0, 200));
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

// ── IC Session routes ─────────────────────────────────────────────────────────

const IC_OUTCOMES = ["Approved", "Conditional", "Rejected", "Deferred"] as const;

const CreateIcSessionBodySchema = z.object({
  sessionDate: z.string().min(1),
  attendees: z.string().nullable().optional(),
  outcome: z.enum(IC_OUTCOMES),
  conditions: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

function formatIcSession(s: typeof icSessionsTable.$inferSelect) {
  return {
    ...s,
    sessionDate: s.sessionDate ? String(s.sessionDate).slice(0, 10) : null,
    createdAt: toIso(s.createdAt),
  };
}

// GET /api/targets/:id/ic-sessions
router.get("/:id/ic-sessions", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const sessions = await db
    .select()
    .from(icSessionsTable)
    .where(eq(icSessionsTable.targetId, id))
    .orderBy(desc(icSessionsTable.sessionDate), desc(icSessionsTable.createdAt));
  return res.json(sessions.map(formatIcSession));
});

// POST /api/targets/:id/ic-sessions
router.post("/:id/ic-sessions", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const parsed = CreateIcSessionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();
  const [session] = await db
    .insert(icSessionsTable)
    .values({
      targetId,
      sessionDate: d.sessionDate,
      attendees: d.attendees ?? null,
      outcome: d.outcome,
      conditions: d.conditions ?? null,
      notes: d.notes ?? null,
      createdAt: now,
    })
    .returning();
  return res.status(201).json(formatIcSession(session));
});

// ── Valuation routes ──────────────────────────────────────────────────────────

const VALUATION_METHODOLOGIES = ["DCF", "Trading Comps", "Transaction Comps", "LBO", "Asset", "Other"] as const;

const CreateValuationBodySchema = z.object({
  methodology: z.string().min(1),
  valueLow: z.string().nullable().optional(),
  valuePoint: z.string().nullable().optional(),
  valueHigh: z.string().nullable().optional(),
  currency: z.string().optional(),
  stageAtRecord: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  recordedBy: z.string().nullable().optional(),
});

function formatValuation(v: typeof valuationsTable.$inferSelect) {
  return {
    ...v,
    recordedAt: toIso(v.recordedAt),
  };
}

// GET /api/targets/:id/valuations
router.get("/:id/valuations", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const rows = await db
    .select()
    .from(valuationsTable)
    .where(eq(valuationsTable.targetId, id))
    .orderBy(desc(valuationsTable.recordedAt));
  return res.json(rows.map(formatValuation));
});

// POST /api/targets/:id/valuations
router.post("/:id/valuations", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const parsed = CreateValuationBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;

  // Compute next version for this target
  const existing = await db
    .select({ version: valuationsTable.version })
    .from(valuationsTable)
    .where(eq(valuationsTable.targetId, targetId))
    .orderBy(desc(valuationsTable.version))
    .limit(1);
  const nextVersion = existing.length > 0 ? (existing[0]!.version + 1) : 1;

  const now = new Date();
  const [row] = await db
    .insert(valuationsTable)
    .values({
      targetId,
      version: nextVersion,
      methodology: d.methodology,
      valueLow: d.valueLow ?? null,
      valuePoint: d.valuePoint ?? null,
      valueHigh: d.valueHigh ?? null,
      currency: d.currency ?? "USD",
      stageAtRecord: d.stageAtRecord ?? null,
      notes: d.notes ?? null,
      recordedBy: d.recordedBy ?? null,
      recordedAt: now,
    })
    .returning();
  return res.status(201).json(formatValuation(row));
});

// ── Synergies routes ──────────────────────────────────────────────────────────

const SYNERGY_TYPES = ["Revenue", "Cost", "Capital", "Tax"] as const;
const SYNERGY_CONFIDENCES = ["Probable", "Possible", "Aspirational"] as const;
const SYNERGY_STATUSES = ["Not Started", "On Track", "Slipping", "Realised"] as const;

const CreateSynergyBodySchema = z.object({
  type: z.enum(SYNERGY_TYPES),
  description: z.string().min(1),
  fy1: z.number().nullable().optional(),
  fy2: z.number().nullable().optional(),
  fy3: z.number().nullable().optional(),
  fy4: z.number().nullable().optional(),
  fy5: z.number().nullable().optional(),
  oneTimeCost: z.number().nullable().optional(),
  confidence: z.enum(SYNERGY_CONFIDENCES),
  ownerName: z.string().nullable().optional(),
  realisationStartMonth: z.string().nullable().optional(),
  realisationStatus: z.enum(SYNERGY_STATUSES).optional(),
  isDisynergy: z.boolean().optional(),
});

function formatSynergy(s: typeof synergiesTable.$inferSelect) {
  return {
    ...s,
    createdAt: toIso(s.createdAt),
    updatedAt: toIso(s.updatedAt),
  };
}

// GET /api/targets/:id/synergies
router.get("/:id/synergies", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const rows = await db
    .select()
    .from(synergiesTable)
    .where(eq(synergiesTable.targetId, id))
    .orderBy(desc(synergiesTable.createdAt));
  return res.json(rows.map(formatSynergy));
});

// POST /api/targets/:id/synergies
router.post("/:id/synergies", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const parsed = CreateSynergyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();
  const [row] = await db
    .insert(synergiesTable)
    .values({
      targetId,
      type: d.type,
      description: d.description,
      fy1: d.fy1 ?? null,
      fy2: d.fy2 ?? null,
      fy3: d.fy3 ?? null,
      fy4: d.fy4 ?? null,
      fy5: d.fy5 ?? null,
      oneTimeCost: d.oneTimeCost ?? null,
      confidence: d.confidence,
      ownerName: d.ownerName ?? null,
      realisationStartMonth: d.realisationStartMonth ?? null,
      realisationStatus: d.realisationStatus ?? "Not Started",
      isDisynergy: d.isDisynergy ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return res.status(201).json(formatSynergy(row));
});

// ── Deal Economics routes ─────────────────────────────────────────────────────

const UpsertEconomicsBodySchema = z.object({
  cashPct: z.string().nullable().optional(),
  equityPct: z.string().nullable().optional(),
  earnoutPct: z.string().nullable().optional(),
  deferredPct: z.string().nullable().optional(),
  escrowPct: z.string().nullable().optional(),
  totalEv: z.string().nullable().optional(),
  totalEquityValue: z.string().nullable().optional(),
  irrBase: z.string().nullable().optional(),
  irrUpside: z.string().nullable().optional(),
  irrDownside: z.string().nullable().optional(),
  moicBase: z.string().nullable().optional(),
  moicUpside: z.string().nullable().optional(),
  moicDownside: z.string().nullable().optional(),
  paybackYears: z.string().nullable().optional(),
});

function formatEconomics(e: typeof dealEconomicsTable.$inferSelect) {
  return {
    ...e,
    updatedAt: toIso(e.updatedAt),
  };
}

// GET /api/targets/:id/economics
router.get("/:id/economics", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const [row] = await db
    .select()
    .from(dealEconomicsTable)
    .where(eq(dealEconomicsTable.targetId, targetId))
    .limit(1);
  if (!row) {
    return res.json({ id: 0, targetId, updatedAt: null });
  }
  return res.json(formatEconomics(row));
});

// PUT /api/targets/:id/economics
router.put("/:id/economics", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const parsed = UpsertEconomicsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const d = parsed.data;
  const now = new Date();

  const existing = await db
    .select({ id: dealEconomicsTable.id })
    .from(dealEconomicsTable)
    .where(eq(dealEconomicsTable.targetId, targetId))
    .limit(1);

  let row: typeof dealEconomicsTable.$inferSelect;

  if (existing.length > 0) {
    const [updated] = await db
      .update(dealEconomicsTable)
      .set({
        cashPct: d.cashPct ?? null,
        equityPct: d.equityPct ?? null,
        earnoutPct: d.earnoutPct ?? null,
        deferredPct: d.deferredPct ?? null,
        escrowPct: d.escrowPct ?? null,
        totalEv: d.totalEv ?? null,
        totalEquityValue: d.totalEquityValue ?? null,
        irrBase: d.irrBase ?? null,
        irrUpside: d.irrUpside ?? null,
        irrDownside: d.irrDownside ?? null,
        moicBase: d.moicBase ?? null,
        moicUpside: d.moicUpside ?? null,
        moicDownside: d.moicDownside ?? null,
        paybackYears: d.paybackYears ?? null,
        updatedAt: now,
      })
      .where(eq(dealEconomicsTable.targetId, targetId))
      .returning();
    row = updated;
  } else {
    const [inserted] = await db
      .insert(dealEconomicsTable)
      .values({
        targetId,
        cashPct: d.cashPct ?? null,
        equityPct: d.equityPct ?? null,
        earnoutPct: d.earnoutPct ?? null,
        deferredPct: d.deferredPct ?? null,
        escrowPct: d.escrowPct ?? null,
        totalEv: d.totalEv ?? null,
        totalEquityValue: d.totalEquityValue ?? null,
        irrBase: d.irrBase ?? null,
        irrUpside: d.irrUpside ?? null,
        irrDownside: d.irrDownside ?? null,
        moicBase: d.moicBase ?? null,
        moicUpside: d.moicUpside ?? null,
        moicDownside: d.moicDownside ?? null,
        paybackYears: d.paybackYears ?? null,
        updatedAt: now,
      })
      .returning();
    row = inserted;
  }

  return res.json(formatEconomics(row));
});

// ─── NDA Records ──────────────────────────────────────────────────────────────

const NDA_SCOPES_CONST = ["One-way", "Mutual"] as const;
const NDA_STATUSES_CONST = ["Active", "Expired", "Extended"] as const;

const CreateNdaBodySchema = z.object({
  counterparty: z.string().nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  scope: z.enum(NDA_SCOPES_CONST).default("Mutual"),
  termMonths: z.number().int().nullable().optional(),
  docReference: z.string().nullable().optional(),
  status: z.enum(NDA_STATUSES_CONST).default("Active"),
  notes: z.string().nullable().optional(),
});

router.get("/:id/nda-records", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const rows = await db
    .select()
    .from(ndaRecordsTable)
    .where(eq(ndaRecordsTable.targetId, targetId))
    .orderBy(ndaRecordsTable.createdAt);
  return res.json(rows);
});

router.post("/:id/nda-records", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const parsed = CreateNdaBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db
    .insert(ndaRecordsTable)
    .values({ targetId, ...parsed.data })
    .returning();
  return res.status(201).json(created);
});

// ─── Regulatory Clearances ─────────────────────────────────────────────────────

const CLEARANCE_CATEGORIES_CONST = [
  "Antitrust-CCI", "RBI", "SEBI", "IRDAI", "FEMA-FDI", "DPDP",
  "Sanctions-PEP", "ABAC", "Other",
] as const;
const CLEARANCE_STATUSES_CONST = ["Not Required", "Pending", "Filed", "Cleared", "Blocked"] as const;

const CreateClearanceBodySchema = z.object({
  category: z.enum(CLEARANCE_CATEGORIES_CONST),
  description: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  status: z.enum(CLEARANCE_STATUSES_CONST).default("Pending"),
  targetClearanceDate: z.string().nullable().optional(),
  evidenceReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/:id/regulatory-clearances", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const rows = await db
    .select()
    .from(regulatoryClearancesTable)
    .where(eq(regulatoryClearancesTable.targetId, targetId))
    .orderBy(regulatoryClearancesTable.createdAt);
  return res.json(rows);
});

router.post("/:id/regulatory-clearances", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const parsed = CreateClearanceBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db
    .insert(regulatoryClearancesTable)
    .values({ targetId, ...parsed.data })
    .returning();
  return res.status(201).json(created);
});

// ─── Counterparty structured fields ───────────────────────────────────────────

const UpdateCounterpartyBodySchema = z.object({
  cpCin: z.string().nullable().optional(),
  cpFounders: z.string().nullable().optional(),
  cpKeyManagement: z.string().nullable().optional(),
  cpControllingShareholderS: z.string().nullable().optional(),
  cpWebsite: z.string().nullable().optional(),
  cpNotes: z.string().nullable().optional(),
});

router.get("/:id/counterparty", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const result = await db.execute(
    sql`SELECT id, project_name, legal_name,
               cp_cin, cp_founders, cp_key_management,
               cp_controlling_shareholders, cp_website, cp_notes
        FROM targets WHERE id = ${targetId} LIMIT 1`,
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Target not found" });
  const r = result.rows[0] as Record<string, unknown>;
  return res.json({
    id: r.id,
    projectName: r.project_name,
    legalName: r.legal_name,
    cpCin: r.cp_cin,
    cpFounders: r.cp_founders,
    cpKeyManagement: r.cp_key_management,
    cpControllingShareholderS: r.cp_controlling_shareholders,
    cpWebsite: r.cp_website,
    cpNotes: r.cp_notes,
  });
});

router.put("/:id/counterparty", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const parsed = UpdateCounterpartyBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  await db.execute(sql`
    UPDATE targets SET
      cp_cin                     = COALESCE(${d.cpCin ?? null}, cp_cin),
      cp_founders                = COALESCE(${d.cpFounders ?? null}, cp_founders),
      cp_key_management          = COALESCE(${d.cpKeyManagement ?? null}, cp_key_management),
      cp_controlling_shareholders = COALESCE(${d.cpControllingShareholderS ?? null}, cp_controlling_shareholders),
      cp_website                 = COALESCE(${d.cpWebsite ?? null}, cp_website),
      cp_notes                   = COALESCE(${d.cpNotes ?? null}, cp_notes),
      updated_at = now()
    WHERE id = ${targetId}
  `);
  // Re-fetch and return
  const result = await db.execute(
    sql`SELECT id, project_name, legal_name,
               cp_cin, cp_founders, cp_key_management,
               cp_controlling_shareholders, cp_website, cp_notes
        FROM targets WHERE id = ${targetId} LIMIT 1`,
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Target not found" });
  const r = result.rows[0] as Record<string, unknown>;
  return res.json({
    id: r.id,
    projectName: r.project_name,
    legalName: r.legal_name,
    cpCin: r.cp_cin,
    cpFounders: r.cp_founders,
    cpKeyManagement: r.cp_key_management,
    cpControllingShareholderS: r.cp_controlling_shareholders,
    cpWebsite: r.cp_website,
    cpNotes: r.cp_notes,
  });
});

// ─── Advisors ─────────────────────────────────────────────────────────────────

const ADVISOR_TYPES_CONST = [
  "Buy-side Banker",
  "Sell-side Banker",
  "Legal Counsel",
  "Tax Advisor",
  "Commercial DD",
  "ESG Advisor",
  "Cyber DD",
  "Integration Advisor",
  "Other",
] as const;

const CONFLICTS_STATUSES_CONST = ["Pending", "Cleared", "Flagged"] as const;
const ADVISOR_SIDES_CONST = ["buy-side", "sell-side"] as const;

const CreateAdvisorBodySchema = z.object({
  side: z.enum(ADVISOR_SIDES_CONST).default("buy-side"),
  advisorType: z.enum(ADVISOR_TYPES_CONST),
  firmName: z.string().min(1),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  engagementDate: z.string().nullable().optional(),
  feeStructure: z.string().nullable().optional(),
  conflictsStatus: z.enum(CONFLICTS_STATUSES_CONST).default("Pending"),
  notes: z.string().nullable().optional(),
});

router.get("/:id/advisors", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const rows = await db
    .select()
    .from(dealAdvisorsTable)
    .where(eq(dealAdvisorsTable.targetId, targetId))
    .orderBy(dealAdvisorsTable.createdAt);
  return res.json(rows);
});

router.post("/:id/advisors", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const parsed = CreateAdvisorBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db
    .insert(dealAdvisorsTable)
    .values({ targetId, ...parsed.data })
    .returning();
  return res.status(201).json(created);
});

// ─── Sponsors ────────────────────────────────────────────────────────────────

const CreateSponsorBodySchema = z.object({
  name: z.string().min(1),
  roleTitle: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/:id/sponsors", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const rows = await db
    .select()
    .from(dealSponsorsTable)
    .where(eq(dealSponsorsTable.targetId, targetId))
    .orderBy(dealSponsorsTable.createdAt);
  return res.json(rows);
});

router.post("/:id/sponsors", async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const parsed = CreateSponsorBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db
    .insert(dealSponsorsTable)
    .values({ targetId, ...parsed.data })
    .returning();
  return res.status(201).json(created);
});

export default router;
