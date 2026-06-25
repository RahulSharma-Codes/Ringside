import { Router } from "express";
import { db } from "@workspace/db";
import { targetsTable, milestonesTable } from "@workspace/db";
import { eq, inArray, isNotNull } from "drizzle-orm";

const router = Router();

const CLOSED_STAGES = new Set(["Closed", "Dropped", "Rejected"]);

// GET /api/doctrine/summary
router.get("/summary", async (_req, res) => {
  const allTargets = await db
    .select({
      id: targetsTable.id,
      targetCode: targetsTable.targetCode,
      projectName: targetsTable.projectName,
      sector: targetsTable.sector,
      closeReasonCode: targetsTable.closeReasonCode,
      phase1VerdictAccuracy: targetsTable.phase1VerdictAccuracy,
      phase1VerdictNote: targetsTable.phase1VerdictNote,
      closeMissTheme: targetsTable.closeMissTheme,
      updatedAt: targetsTable.updatedAt,
      currentStage: milestonesTable.currentStage,
    })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id));

  const closedDeals = allTargets.filter((t) =>
    CLOSED_STAGES.has(t.currentStage ?? ""),
  );

  // Accuracy by sector
  const sectorMap = new Map<
    string,
    { correct: number; partiallyCorrect: number; wrong: number; total: number }
  >();

  for (const deal of closedDeals) {
    if (!deal.phase1VerdictAccuracy) continue;
    const sector = deal.sector ?? "Unknown";
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, { correct: 0, partiallyCorrect: 0, wrong: 0, total: 0 });
    }
    const entry = sectorMap.get(sector)!;
    entry.total++;
    if (deal.phase1VerdictAccuracy === "Correct") entry.correct++;
    else if (deal.phase1VerdictAccuracy === "Partially-correct") entry.partiallyCorrect++;
    else if (deal.phase1VerdictAccuracy === "Wrong") entry.wrong++;
  }

  const accuracyBySector = Array.from(sectorMap.entries())
    .map(([sector, counts]) => ({ sector, ...counts }))
    .sort((a, b) => b.total - a.total);

  // Miss themes
  const themeMap = new Map<string, number>();
  for (const deal of closedDeals) {
    if (!deal.closeMissTheme) continue;
    themeMap.set(deal.closeMissTheme, (themeMap.get(deal.closeMissTheme) ?? 0) + 1);
  }
  const missThemes = Array.from(themeMap.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count);

  // Win/Loss by sector (Closed = win, Dropped/Rejected = loss)
  const winLossMap = new Map<string, { wins: number; losses: number }>();
  for (const deal of closedDeals) {
    const sector = deal.sector ?? "Unknown";
    if (!winLossMap.has(sector)) winLossMap.set(sector, { wins: 0, losses: 0 });
    const entry = winLossMap.get(sector)!;
    if (deal.currentStage === "Closed") entry.wins++;
    else entry.losses++;
  }
  const winLossBySector = Array.from(winLossMap.entries())
    .map(([sector, counts]) => ({ sector, ...counts, total: counts.wins + counts.losses }))
    .sort((a, b) => b.total - a.total);

  // Recent closures — last 10
  const recentClosures = [...closedDeals]
    .sort((a, b) => {
      const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      targetCode: t.targetCode,
      projectName: t.projectName,
      sector: t.sector ?? null,
      currentStage: t.currentStage ?? "Unknown",
      closeReasonCode: t.closeReasonCode ?? null,
      phase1VerdictAccuracy: t.phase1VerdictAccuracy ?? null,
      phase1VerdictNote: t.phase1VerdictNote ?? null,
      closeMissTheme: t.closeMissTheme ?? null,
      updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : null,
    }));

  return res.json({ accuracyBySector, missThemes, winLossBySector, recentClosures });
});

export default router;
