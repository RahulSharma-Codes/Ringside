import { Router } from "express";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  stageChangeLogTable,
} from "@workspace/db";
import { TERMINAL_STAGES } from "../constants";

const router = Router();

const DROPPED_STAGES = new Set(["Rejected"]);
const WON_STAGES = new Set(["Closing", "Closed", "Completed", "Signed"]);

const FUNNEL_ORDER = [
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

// ---------------------------------------------------------------------------
// GET /api/analytics/funnel
// ---------------------------------------------------------------------------
router.get("/funnel", async (_req, res) => {
  const [stageLogs, milestones] = await Promise.all([
    db.select().from(stageChangeLogTable),
    db
      .select({ m: milestonesTable, t: targetsTable })
      .from(milestonesTable)
      .innerJoin(targetsTable, eq(targetsTable.id, milestonesTable.targetId)),
  ]);

  // Count distinct targets that ever reached each stage (via stage_change_log)
  const enteredByStage: Record<string, Set<number>> = {};
  for (const log of stageLogs) {
    const stage = log.newStage;
    if (!enteredByStage[stage]) enteredByStage[stage] = new Set();
    enteredByStage[stage]!.add(log.targetId);
  }

  // Count current active targets per stage (excluding terminal)
  const currentByStage: Record<string, number> = {};
  for (const row of milestones) {
    const stage = row.m.currentStage;
    if (row.t.isActive && !TERMINAL_STAGES.has(stage) && !DROPPED_STAGES.has(stage)) {
      currentByStage[stage] = (currentByStage[stage] ?? 0) + 1;
    }
  }

  const result = FUNNEL_ORDER.map((stage) => {
    const entered = enteredByStage[stage]?.size ?? 0;
    const current = currentByStage[stage] ?? 0;
    return { stage, entered, current };
  }).filter((r) => r.entered > 0 || r.current > 0);

  return res.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/analytics/time-in-stage
// ---------------------------------------------------------------------------
router.get("/time-in-stage", async (_req, res) => {
  const logs = await db
    .select()
    .from(stageChangeLogTable)
    .orderBy(stageChangeLogTable.targetId, stageChangeLogTable.changedAt);

  // Group by targetId
  const byTarget: Record<number, typeof logs> = {};
  for (const log of logs) {
    if (!byTarget[log.targetId]) byTarget[log.targetId] = [];
    byTarget[log.targetId]!.push(log);
  }

  // For each consecutive pair within the same target, record dwell in "from" stage
  const dwellByStage: Record<string, number[]> = {};

  for (const entries of Object.values(byTarget)) {
    for (let i = 0; i < entries.length - 1; i++) {
      const curr = entries[i]!;
      const next = entries[i + 1]!;
      const stage = curr.newStage;
      if (!FUNNEL_ORDER.includes(stage)) continue;
      const from = new Date(curr.changedAt).getTime();
      const to = new Date(next.changedAt).getTime();
      const days = (to - from) / (1000 * 60 * 60 * 24);
      if (days < 0 || days > 3650) continue; // sanity filter
      if (!dwellByStage[stage]) dwellByStage[stage] = [];
      dwellByStage[stage]!.push(days);
    }
  }

  const result = FUNNEL_ORDER.filter((s) => (dwellByStage[s]?.length ?? 0) > 0).map((stage) => {
    const vals = dwellByStage[stage]!.sort((a, b) => a - b);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const mid = Math.floor(vals.length / 2);
    const median = vals.length % 2 === 0
      ? ((vals[mid - 1] ?? 0) + (vals[mid] ?? 0)) / 2
      : (vals[mid] ?? 0);
    return {
      stage,
      avgDays: Math.round(avg * 10) / 10,
      medianDays: Math.round(median * 10) / 10,
      count: vals.length,
    };
  });

  return res.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/analytics/win-loss
// ---------------------------------------------------------------------------
router.get("/win-loss", async (_req, res) => {
  const rows = await db
    .select({ t: targetsTable, m: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id));

  let won = 0;
  let dropped = 0;
  let inProgress = 0;

  const byDropReason: Record<string, number> = {};
  const byDealType: Record<string, { won: number; dropped: number; inProgress: number }> = {};

  for (const row of rows) {
    const stage = row.m?.currentStage ?? "Sourcing";
    const dealType = row.t.dealType ?? "Unspecified";
    if (!byDealType[dealType]) byDealType[dealType] = { won: 0, dropped: 0, inProgress: 0 };

    if (WON_STAGES.has(stage)) {
      won++;
      byDealType[dealType]!.won++;
    } else if (!row.t.isActive || DROPPED_STAGES.has(stage)) {
      dropped++;
      byDealType[dealType]!.dropped++;
      const cat = row.m?.dropReasonCategory ?? "Unknown";
      byDropReason[cat] = (byDropReason[cat] ?? 0) + 1;
    } else {
      inProgress++;
      byDealType[dealType]!.inProgress++;
    }
  }

  return res.json({
    totalEvaluated: rows.length,
    won,
    dropped,
    inProgress,
    byDropReason: Object.entries(byDropReason)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    byDealType: Object.entries(byDealType)
      .map(([type, counts]) => ({ type, ...counts }))
      .filter((r) => r.won + r.dropped + r.inProgress > 0)
      .sort((a, b) => (b.won + b.dropped + b.inProgress) - (a.won + a.dropped + a.inProgress)),
  });
});

// ---------------------------------------------------------------------------
// GET /api/analytics/origination
// ---------------------------------------------------------------------------
router.get("/origination", async (_req, res) => {
  const rows = await db
    .select({ t: targetsTable, m: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id));

  const byChannel: Record<string, { total: number; won: number; dropped: number; inProgress: number }> = {};

  for (const row of rows) {
    const channel = row.t.sourcingChannel ?? "Unknown";
    const stage = row.m?.currentStage ?? "Sourcing";
    if (!byChannel[channel]) byChannel[channel] = { total: 0, won: 0, dropped: 0, inProgress: 0 };
    byChannel[channel]!.total++;

    if (WON_STAGES.has(stage)) {
      byChannel[channel]!.won++;
    } else if (!row.t.isActive || DROPPED_STAGES.has(stage)) {
      byChannel[channel]!.dropped++;
    } else {
      byChannel[channel]!.inProgress++;
    }
  }

  const result = Object.entries(byChannel)
    .map(([channel, counts]) => {
      const concluded = counts.won + counts.dropped;
      return {
        channel,
        ...counts,
        winRate: concluded > 0 ? Math.round((counts.won / concluded) * 100) : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  return res.json(result);
});

export default router;
