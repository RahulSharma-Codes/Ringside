import { Router } from "express";
import { eq, and, gte, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  stageChangeLogTable,
} from "@workspace/db";
import { z } from "zod";

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

const AnalyticsQueryParams = z.object({
  dealType: z.string().optional(),
  sector: z.string().optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function twelveMonthsAgo(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d;
}

// ---------------------------------------------------------------------------
// GET /api/analytics/funnel
// ---------------------------------------------------------------------------
router.get("/funnel", async (req, res) => {
  const parsed = AnalyticsQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { dealType, sector } = parsed.data;

  const rows = await db
    .select({ t: targetsTable, m: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id));

  const filteredIds = new Set(
    rows
      .filter((r) => {
        if (dealType && r.t.dealType !== dealType) return false;
        if (sector && r.t.sector !== sector) return false;
        return true;
      })
      .map((r) => r.t.id),
  );

  const stageLogs = filteredIds.size > 0
    ? await db.select().from(stageChangeLogTable).where(
        inArray(stageChangeLogTable.targetId, [...filteredIds]),
      )
    : [];

  // Count distinct targets that ever reached each stage
  const enteredByStage: Record<string, Set<number>> = {};
  for (const log of stageLogs) {
    const stage = log.newStage;
    if (!enteredByStage[stage]) enteredByStage[stage] = new Set();
    enteredByStage[stage]!.add(log.targetId);
  }

  // Count currently active targets per stage
  const currentByStage: Record<string, number> = {};
  for (const row of rows) {
    if (!filteredIds.has(row.t.id)) continue;
    const stage = row.m?.currentStage ?? "Sourcing";
    if (row.t.isActive && FUNNEL_ORDER.includes(stage)) {
      currentByStage[stage] = (currentByStage[stage] ?? 0) + 1;
    }
  }

  const result = FUNNEL_ORDER.map((stage, idx) => {
    const entered = enteredByStage[stage]?.size ?? 0;
    const current = currentByStage[stage] ?? 0;
    // Conversion rate = deals that entered next stage / deals that entered this stage
    let conversionRate: number | null = null;
    if (idx < FUNNEL_ORDER.length - 1) {
      const nextStage = FUNNEL_ORDER[idx + 1]!;
      const nextEntered = enteredByStage[nextStage]?.size ?? 0;
      conversionRate = entered > 0 ? Math.round((nextEntered / entered) * 1000) / 10 : null;
    }
    return { stage, entered, current, conversionRate };
  }).filter((r) => r.entered > 0 || r.current > 0);

  return res.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/analytics/time-in-stage
// ---------------------------------------------------------------------------
router.get("/time-in-stage", async (req, res) => {
  const parsed = AnalyticsQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { dealType, sector } = parsed.data;

  const rows = await db
    .select({ t: targetsTable, m: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id));

  const filteredRows = rows.filter((r) => {
    if (dealType && r.t.dealType !== dealType) return false;
    if (sector && r.t.sector !== sector) return false;
    return true;
  });

  const filteredIds = new Set(filteredRows.map((r) => r.t.id));

  const logs = filteredIds.size > 0
    ? await db
        .select()
        .from(stageChangeLogTable)
        .where(inArray(stageChangeLogTable.targetId, [...filteredIds]))
    : [];

  // Sort logs by targetId, then changedAt
  logs.sort((a, b) => {
    if (a.targetId !== b.targetId) return a.targetId - b.targetId;
    return new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime();
  });

  // Group by targetId for historical dwell computation
  const byTarget: Record<number, typeof logs> = {};
  for (const log of logs) {
    if (!byTarget[log.targetId]) byTarget[log.targetId] = [];
    byTarget[log.targetId]!.push(log);
  }

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
      if (days < 0 || days > 3650) continue;
      if (!dwellByStage[stage]) dwellByStage[stage] = [];
      dwellByStage[stage]!.push(days);
    }
  }

  const historical = FUNNEL_ORDER.filter(
    (s) => (dwellByStage[s]?.length ?? 0) > 0,
  ).map((stage) => {
    const vals = dwellByStage[stage]!.sort((a, b) => a - b);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const mid = Math.floor(vals.length / 2);
    const median =
      vals.length % 2 === 0
        ? ((vals[mid - 1] ?? 0) + (vals[mid] ?? 0)) / 2
        : (vals[mid] ?? 0);
    return {
      stage,
      avgDays: Math.round(avg * 10) / 10,
      medianDays: Math.round(median * 10) / 10,
      count: vals.length,
    };
  });

  // Per-deal current-stage aging (active targets only)
  const now = Date.now();
  const STALE_THRESHOLD_DAYS = 30;

  const currentDeals = filteredRows
    .filter((r) => r.t.isActive && r.m && FUNNEL_ORDER.includes(r.m.currentStage))
    .map((r) => {
      const enteredAt = r.m!.stageEnteredAt
        ? new Date(r.m!.stageEnteredAt).getTime()
        : new Date(r.t.createdAt).getTime();
      const daysInStage = Math.round((now - enteredAt) / (1000 * 60 * 60 * 24) * 10) / 10;
      return {
        targetId: r.t.id,
        targetCode: r.t.targetCode,
        projectName: r.t.projectName,
        stage: r.m!.currentStage,
        daysInStage,
        isStale: daysInStage > STALE_THRESHOLD_DAYS,
        dealOwner: r.t.dealOwner,
      };
    })
    .sort((a, b) => b.daysInStage - a.daysInStage);

  return res.json({ historical, currentDeals });
});

// ---------------------------------------------------------------------------
// GET /api/analytics/win-loss
// ---------------------------------------------------------------------------
router.get("/win-loss", async (req, res) => {
  const parsed = AnalyticsQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { dealType, sector } = parsed.data;

  const cutoff = twelveMonthsAgo();

  // Get all stage change log entries in trailing 12m that are terminal transitions
  const terminalLogs = await db
    .select()
    .from(stageChangeLogTable)
    .where(
      and(
        gte(stageChangeLogTable.changedAt, cutoff),
      ),
    );

  // Get all targets with milestones for context
  const rows = await db
    .select({ t: targetsTable, m: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id));

  const targetMap = new Map(rows.map((r) => [r.t.id, r]));

  // Identify targets that had a terminal event in the last 12m
  // Won: newStage in WON_STAGES; Dropped: newStage in DROPPED_STAGES
  const concludedTargetIds = new Set<number>();
  const wonTargetIds = new Set<number>();
  const droppedTargetIds = new Set<number>();
  const dropReasonsByTarget = new Map<number, string | null>();

  for (const log of terminalLogs) {
    const row = targetMap.get(log.targetId);
    if (!row) continue;
    if (dealType && row.t.dealType !== dealType) continue;
    if (sector && row.t.sector !== sector) continue;

    if (WON_STAGES.has(log.newStage)) {
      wonTargetIds.add(log.targetId);
      concludedTargetIds.add(log.targetId);
    } else if (DROPPED_STAGES.has(log.newStage)) {
      droppedTargetIds.add(log.targetId);
      concludedTargetIds.add(log.targetId);
      if (!dropReasonsByTarget.has(log.targetId)) {
        dropReasonsByTarget.set(log.targetId, log.changeReason);
      }
    }
  }

  const won = wonTargetIds.size;
  const dropped = droppedTargetIds.size;
  const totalConcluded = concludedTargetIds.size;

  // Drop reason breakdown (from stage_change_log changeReason)
  const dropReasonCounts: Record<string, number> = {};
  for (const [, reason] of dropReasonsByTarget) {
    const cat = reason && reason.trim() ? reason.trim().slice(0, 60) : "No reason recorded";
    dropReasonCounts[cat] = (dropReasonCounts[cat] ?? 0) + 1;
  }

  const byDropReason = Object.entries(dropReasonCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Sector breakdown of concluded deals in trailing 12m
  const sectorMap: Record<string, { won: number; dropped: number }> = {};
  for (const targetId of concludedTargetIds) {
    const row = targetMap.get(targetId);
    if (!row) continue;
    const sec = row.t.sector ?? "Unspecified";
    if (!sectorMap[sec]) sectorMap[sec] = { won: 0, dropped: 0 };
    if (wonTargetIds.has(targetId)) sectorMap[sec]!.won++;
    else if (droppedTargetIds.has(targetId)) sectorMap[sec]!.dropped++;
  }

  const bySector = Object.entries(sectorMap)
    .map(([sec, counts]) => ({ sector: sec, ...counts }))
    .sort((a, b) => (b.won + b.dropped) - (a.won + a.dropped));

  return res.json({
    periodLabel: "Trailing 12 months",
    totalConcluded,
    won,
    dropped,
    winRate: totalConcluded > 0 ? Math.round((won / totalConcluded) * 1000) / 10 : null,
    byDropReason,
    bySector,
  });
});

// ---------------------------------------------------------------------------
// GET /api/analytics/origination
// ---------------------------------------------------------------------------
router.get("/origination", async (req, res) => {
  const parsed = AnalyticsQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { dealType, sector } = parsed.data;

  const rows = await db
    .select({ t: targetsTable, m: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id));

  const byChannel: Record<string, { total: number; won: number; dropped: number; inProgress: number }> = {};

  for (const row of rows) {
    if (dealType && row.t.dealType !== dealType) continue;
    if (sector && row.t.sector !== sector) continue;

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
        winRate: concluded > 0 ? Math.round((counts.won / concluded) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  return res.json(result);
});

export default router;
