import { Router } from "express";
import { eq, and, inArray, gte, isNull, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  milestonesTable,
  actionItemsTable,
  interactionsTable,
  stageChangeLogTable,
  synergiesTable,
} from "@workspace/db";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { canAccessTarget, getAccessScope } from "../lib/target-access";

const router = Router();

// ── Column definitions ────────────────────────────────────────────────────
export const PIPELINE_COLUMNS = [
  { key: "targetCode",                   header: "Target Code",     width: 14 },
  { key: "projectName",                  header: "Project Name",    width: 30 },
  { key: "legalName",                    header: "Legal Name",      width: 28 },
  { key: "sector",                       header: "Sector",          width: 16 },
  { key: "country",                      header: "Country",         width: 14 },
  { key: "dealType",                     header: "Deal Type",       width: 14 },
  { key: "priorityTier",                 header: "Priority Tier",   width: 14 },
  { key: "currentStage",                 header: "Current Stage",   width: 18 },
  { key: "dealOwner",                    header: "Deal Owner",      width: 18 },
  { key: "strategicFitScore",            header: "Strat Fit",       width: 10 },
  { key: "financialAttractivenessScore", header: "Financial Score", width: 14 },
  { key: "synergyScore",                 header: "Synergy Score",   width: 13 },
  { key: "ndaStatus",                    header: "NDA Status",      width: 14 },
  { key: "financialDdStatus",            header: "Financial DD",    width: 16 },
  { key: "legalDdStatus",               header: "Legal DD",        width: 14 },
  { key: "createdAt",                    header: "Created",         width: 12 },
] as const;

// ── XLSX: Pipeline Export ─────────────────────────────────────────────────
// GET /api/export/pipeline
router.get("/pipeline", async (req, res) => {
  const { sector, priorityTier, stage, owner, country, dealType, isActive, columns } = req.query as Record<string, string | undefined>;

  const conditions: ReturnType<typeof eq>[] = [];
  if (isActive === "false") conditions.push(eq(targetsTable.isActive, false));
  else conditions.push(eq(targetsTable.isActive, true));
  if (sector) conditions.push(eq(targetsTable.sector, sector));
  if (priorityTier) conditions.push(eq(targetsTable.priorityTier, priorityTier));
  if (owner) conditions.push(eq(targetsTable.dealOwner, owner));
  if (country) conditions.push(eq(targetsTable.country, country));
  if (dealType) conditions.push(eq(targetsTable.dealType, dealType));
  if (stage) conditions.push(eq(milestonesTable.currentStage, stage));

  const scope = await getAccessScope(req);
  if (!scope.isAdmin) {
    if (scope.accessibleTargetIds.length === 0) {
      res.status(400).json({ error: "No accessible deals to export" });
      return;
    }
    conditions.push(inArray(targetsTable.id, scope.accessibleTargetIds));
  }

  const rows = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(and(...conditions))
    .orderBy(desc(targetsTable.updatedAt));

  const selectedKeys = columns
    ? new Set(columns.split(",").map((c) => c.trim()).filter(Boolean))
    : null;

  const activeColumns = selectedKeys
    ? PIPELINE_COLUMNS.filter((c) => selectedKeys.has(c.key))
    : [...PIPELINE_COLUMNS];

  if (activeColumns.length === 0) {
    res.status(400).json({ error: "No valid columns selected" });
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ringside";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Pipeline");
  ws.columns = activeColumns.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  hdr.alignment = { vertical: "middle", horizontal: "center" };
  hdr.height = 18;

  for (const { target: t, milestone: m } of rows) {
    ws.addRow({
      targetCode: t.targetCode,
      projectName: t.projectName,
      legalName: t.legalName ?? "",
      sector: t.sector ?? "",
      country: t.country ?? "",
      dealType: t.dealType ?? "",
      priorityTier: t.priorityTier,
      currentStage: m?.currentStage ?? "Sourcing",
      dealOwner: t.dealOwner ?? "",
      strategicFitScore: t.strategicFitScore,
      financialAttractivenessScore: t.financialAttractivenessScore,
      synergyScore: t.synergyScore,
      ndaStatus: m?.ndaStatus ?? "",
      financialDdStatus: m?.financialDdStatus ?? "",
      legalDdStatus: m?.legalDdStatus ?? "",
      createdAt: t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : "",
    });
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];
  const lastCol = String.fromCharCode(64 + activeColumns.length);
  ws.autoFilter = { from: "A1", to: `${lastCol}1` };

  const filename = `pipeline-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

// ── PDF: Deal Memo ────────────────────────────────────────────────────────
// GET /api/export/memo/:id
router.get("/memo/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await canAccessTarget(req, id))) { res.status(404).json({ error: "Target not found" }); return; }

  const [row] = await db
    .select({ target: targetsTable, milestone: milestonesTable })
    .from(targetsTable)
    .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
    .where(eq(targetsTable.id, id));

  if (!row) { res.status(404).json({ error: "Target not found" }); return; }

  const [openActions, recentInteractions, synergies] = await Promise.all([
    db
      .select({
        id: actionItemsTable.id,
        description: actionItemsTable.description,
        dueDate: actionItemsTable.dueDate,
        owner: actionItemsTable.owner,
        priority: actionItemsTable.priority,
      })
      .from(actionItemsTable)
      .where(
        and(
          eq(actionItemsTable.targetId, id),
          isNull(actionItemsTable.workstream),
          inArray(actionItemsTable.status, ["Open", "In Progress", "Blocked"]),
        ),
      ),
    db
      .select({ interactionDatetime: interactionsTable.interactionDatetime, summary: interactionsTable.summary })
      .from(interactionsTable)
      .where(eq(interactionsTable.targetId, id))
      .orderBy(desc(interactionsTable.interactionDatetime))
      .limit(5),
    db.select().from(synergiesTable).where(eq(synergiesTable.targetId, id)),
  ]);

  const t = row.target;
  const m = row.milestone;

  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
  const filename = `memo-${t.targetCode}-${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  const DARK = "#1E3A5F";
  const GOLD = "#C9AA7C";
  const pageW = doc.page.width;
  const margin = 50;
  const contentW = pageW - margin * 2;

  // ── Header band ────────────────────────────────────────────────────────
  doc.rect(0, 0, pageW, 88).fill(DARK);
  doc.fillColor("#FFFFFF").fontSize(20).font("Helvetica-Bold")
     .text(t.projectName, margin, 18, { width: contentW });
  doc.fillColor("#A8C4E8").fontSize(10).font("Helvetica")
     .text(
       [t.targetCode, t.priorityTier, m?.currentStage ?? "Sourcing"].filter(Boolean).join("  ·  "),
       margin, 48, { width: contentW },
     );
  doc.fillColor("#6B8FB5").fontSize(9)
     .text(`Generated ${new Date().toISOString().slice(0, 10)} · CONFIDENTIAL`, margin, 66, { width: contentW });
  doc.fillColor("#000000").font("Helvetica");

  // ── Section helpers ─────────────────────────────────────────────────────
  const section = (title: string) => {
    if (doc.y > doc.page.height - 130) doc.addPage();
    doc.moveDown(1);
    doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK).text(title.toUpperCase(), { characterSpacing: 0.8 });
    doc.moveDown(0.15);
    doc.moveTo(margin, doc.y).lineTo(pageW - margin, doc.y).lineWidth(1).strokeColor(GOLD).stroke();
    doc.moveDown(0.4);
    doc.fillColor("#111111").fontSize(10).font("Helvetica");
  };

  const field = (label: string, value: string | number | null | undefined, opts?: { continued?: boolean }) => {
    if (value == null || value === "") return;
    doc.font("Helvetica-Bold").text(label + ":  ", { continued: true });
    doc.font("Helvetica").text(String(value), opts);
  };

  const bullet = (text: string) => {
    doc.font("Helvetica").text(`•  ${text}`, { indent: 8, width: contentW - 8 });
    doc.moveDown(0.15);
  };

  // ── Overview ───────────────────────────────────────────────────────────
  section("Overview");
  if (t.legalName)       field("Legal Name", t.legalName);
  field("Sector", [t.sector, t.subsector].filter(Boolean).join(" › ") || null);
  if (t.country)         field("Country", t.country);
  if (t.dealType)        field("Deal Type", t.dealType);
  if (t.dealOwner)       field("Deal Owner", t.dealOwner);
  if (t.businessUnit)    field("Business Unit", t.businessUnit);
  if (t.sourcingChannel) field("Sourcing Channel", t.sourcingChannel);

  // ── Scores ─────────────────────────────────────────────────────────────
  section("Scores");
  field("Strategic Fit", t.strategicFitScore + " / 100");
  field("Financial Attractiveness", t.financialAttractivenessScore + " / 100");
  field("Synergy Potential", t.synergyScore + " / 100");
  if (t.riskPenaltyScore) field("Risk Penalty", "-" + t.riskPenaltyScore);
  const composite = Math.round((t.strategicFitScore + t.financialAttractivenessScore + t.synergyScore) / 3 - t.riskPenaltyScore);
  field("Composite Score", composite + " / 100");

  // ── Strategic Rationale ────────────────────────────────────────────────
  if (t.strategicRationale) {
    section("Strategic Rationale");
    doc.fontSize(10).font("Helvetica").text(t.strategicRationale, { width: contentW, lineGap: 2 });
  }

  // ── Process Status ─────────────────────────────────────────────────────
  if (m) {
    section("Process Status");
    field("Stage", m.currentStage);
    field("NDA Status", m.ndaStatus);
    if (m.ndaDate)              field("NDA Date", String(m.ndaDate));
    if (m.cimReceivedDate)      field("CIM Received", String(m.cimReceivedDate));
    field("Data Room", m.dataRoomAccess);
    if (m.dataRoomAccess !== "No") field("Data Room Date", m.dataRoomAccessDate ? String(m.dataRoomAccessDate) : null);
    field("Commercial DD", m.commercialDdStatus);
    field("Financial DD", m.financialDdStatus);
    field("Legal DD", m.legalDdStatus);
    field("Tax DD", m.taxDdStatus);
    field("Tech DD", m.techDdStatus);
    if (m.nonBindingOfferDate)  field("NBO Date", String(m.nonBindingOfferDate));
    if (m.bindingOfferDate)     field("Binding Offer", String(m.bindingOfferDate));
    if (m.signingDate)          field("Signing", String(m.signingDate));
  }

  // ── Synergies ──────────────────────────────────────────────────────────
  const positives = synergies.filter((s) => !s.isDisynergy);
  const disynergies = synergies.filter((s) => s.isDisynergy);
  if (positives.length > 0) {
    section("Synergies");
    let totalFy5 = 0;
    for (const s of positives) {
      const fy5 = parseFloat(String(s.fy5 ?? "0")) || 0;
      totalFy5 += fy5;
      bullet(`[${s.type}] ${s.description} — ${s.confidence}${fy5 ? ` (FY5: ${fy5.toFixed(1)}m)` : ""}`);
    }
    if (totalFy5 > 0) {
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").text(`Total FY5 Run-Rate: ${totalFy5.toFixed(1)}m`);
    }
    if (disynergies.length > 0) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fillColor("#8B1A1A").text("Dis-synergies:");
      doc.fillColor("#111111").font("Helvetica");
      for (const s of disynergies) {
        bullet(`[${s.type}] ${s.description}`);
      }
    }
  }

  // ── Open Actions ───────────────────────────────────────────────────────
  if (openActions.length > 0) {
    section("Open Actions");
    for (const a of openActions.slice(0, 12)) {
      const due = a.dueDate ? ` (due ${String(a.dueDate).slice(0, 10)})` : "";
      const who = a.owner ? ` — ${a.owner}` : "";
      bullet(`[${a.priority ?? "Normal"}] ${a.description}${due}${who}`);
    }
    if (openActions.length > 12) {
      doc.fontSize(9).fillColor("#555555").text(`  + ${openActions.length - 12} more open actions`).fillColor("#111111").fontSize(10);
    }
  }

  // ── Recent Interactions ────────────────────────────────────────────────
  if (recentInteractions.length > 0) {
    section("Recent Interactions");
    for (const i of recentInteractions) {
      const date = new Date(i.interactionDatetime).toISOString().slice(0, 10);
      doc.font("Helvetica-Bold").text(date + ":  ", { continued: true });
      doc.font("Helvetica").text(i.summary ?? "(no summary)", { width: contentW });
      doc.moveDown(0.3);
    }
  }

  // ── Footer on every page ───────────────────────────────────────────────
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor("#AAAAAA")
       .text(
         `${t.projectName}  ·  ${t.targetCode}  ·  CONFIDENTIAL  ·  Page ${i + 1} of ${pages.count}`,
         margin, doc.page.height - 38, { width: contentW, align: "center" },
       );
  }

  doc.end();
});

// ── PDF: Weekly Review ────────────────────────────────────────────────────
// GET /api/export/weekly-review
router.get("/weekly-review", async (req, res) => {
  const scope = await getAccessScope(req);
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sevenDaysLaterStr = sevenDaysLater.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fortyFiveDaysAgo = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000);

  const [targetsWithMilestonesRaw, allOpenActionsRaw, allInteractionsRaw, recentStageChangesRaw] = await Promise.all([
    db
      .select({
        id: targetsTable.id,
        targetCode: targetsTable.targetCode,
        projectName: targetsTable.projectName,
        priorityTier: targetsTable.priorityTier,
        createdAt: targetsTable.createdAt,
        updatedAt: targetsTable.updatedAt,
        currentStage: milestonesTable.currentStage,
        stageEnteredAt: milestonesTable.stageEnteredAt,
      })
      .from(targetsTable)
      .leftJoin(milestonesTable, eq(milestonesTable.targetId, targetsTable.id))
      .where(eq(targetsTable.isActive, true)),

    db
      .select({
        id: actionItemsTable.id,
        targetId: actionItemsTable.targetId,
        description: actionItemsTable.description,
        owner: actionItemsTable.owner,
        dueDate: actionItemsTable.dueDate,
        priority: actionItemsTable.priority,
        status: actionItemsTable.status,
        targetName: targetsTable.projectName,
        targetCode: targetsTable.targetCode,
      })
      .from(actionItemsTable)
      .leftJoin(targetsTable, eq(actionItemsTable.targetId, targetsTable.id))
      .leftJoin(milestonesTable, eq(milestonesTable.targetId, actionItemsTable.targetId))
      .where(
        and(
          inArray(actionItemsTable.status, ["Open", "In Progress", "Blocked"]),
          isNull(actionItemsTable.workstream),
        ),
      ),

    db
      .select({ targetId: interactionsTable.targetId, interactionDatetime: interactionsTable.interactionDatetime })
      .from(interactionsTable),

    db
      .select({
        targetId: stageChangeLogTable.targetId,
        targetName: targetsTable.projectName,
        targetCode: targetsTable.targetCode,
        previousStage: stageChangeLogTable.previousStage,
        newStage: stageChangeLogTable.newStage,
        changedBy: stageChangeLogTable.changedBy,
        changedAt: stageChangeLogTable.changedAt,
      })
      .from(stageChangeLogTable)
      .leftJoin(targetsTable, eq(stageChangeLogTable.targetId, targetsTable.id))
      .where(gte(stageChangeLogTable.changedAt, sevenDaysAgo))
      .orderBy(desc(stageChangeLogTable.changedAt)),
  ]);

  const targetsWithMilestones = scope.isAdmin
    ? targetsWithMilestonesRaw
    : targetsWithMilestonesRaw.filter((t) => scope.accessibleTargetIds.includes(t.id));
  const allOpenActions = scope.isAdmin
    ? allOpenActionsRaw
    : allOpenActionsRaw.filter((a) => scope.accessibleTargetIds.includes(a.targetId));
  const allInteractions = scope.isAdmin
    ? allInteractionsRaw
    : allInteractionsRaw.filter((i) => scope.accessibleTargetIds.includes(i.targetId));
  const recentStageChanges = scope.isAdmin
    ? recentStageChangesRaw
    : recentStageChangesRaw.filter((s) => scope.accessibleTargetIds.includes(s.targetId));

  const openCountByTarget = new Map<number, number>();
  for (const a of allOpenActions) openCountByTarget.set(a.targetId, (openCountByTarget.get(a.targetId) ?? 0) + 1);

  const lastInteractionByTarget = new Map<number, Date>();
  for (const i of allInteractions) {
    const d = new Date(i.interactionDatetime);
    const ex = lastInteractionByTarget.get(i.targetId);
    if (!ex || d > ex) lastInteractionByTarget.set(i.targetId, d);
  }

  const mustWin = targetsWithMilestones.filter((t) => t.priorityTier === "Must-Win");
  const needsAttention = targetsWithMilestones.filter((t) => {
    const openCount = openCountByTarget.get(t.id) ?? 0;
    const lastInteraction = lastInteractionByTarget.get(t.id);
    const createdAt = t.createdAt ? new Date(t.createdAt) : null;
    if (allOpenActions.some((a) => a.targetId === t.id && a.dueDate && new Date(a.dueDate) < today)) return true;
    if (t.priorityTier === "Must-Win" && openCount === 0) return true;
    if (!lastInteraction) { if (createdAt && createdAt < thirtyDaysAgo) return true; }
    else if (lastInteraction < thirtyDaysAgo) return true;
    const stageDate = t.stageEnteredAt ? new Date(t.stageEnteredAt) : null;
    if (stageDate && stageDate < fortyFiveDaysAgo) return true;
    return false;
  });
  const overdueActions = allOpenActions.filter((a) => a.dueDate && String(a.dueDate).slice(0, 10) < todayStr);
  const dueThisWeek = allOpenActions.filter((a) => {
    const d = a.dueDate ? String(a.dueDate).slice(0, 10) : null;
    return d && d >= todayStr && d <= sevenDaysLaterStr;
  });

  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
  const weekStr = `w/c ${todayStr}`;
  const filename = `weekly-review-${todayStr}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  const DARK = "#1E3A5F";
  const GOLD = "#C9AA7C";
  const pageW = doc.page.width;
  const margin = 50;
  const contentW = pageW - margin * 2;

  // ── Cover band ─────────────────────────────────────────────────────────
  doc.rect(0, 0, pageW, 88).fill(DARK);
  doc.fillColor("#FFFFFF").fontSize(22).font("Helvetica-Bold").text("Weekly Deal Review", margin, 18);
  doc.fillColor("#A8C4E8").fontSize(11).font("Helvetica").text(weekStr, margin, 48);
  doc.fillColor("#6B8FB5").fontSize(9).text(`Generated ${now.toLocaleString()}  ·  CONFIDENTIAL`, margin, 66);
  doc.fillColor("#111111").font("Helvetica");

  const section = (title: string, count?: number) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(1);
    const label = count !== undefined ? `${title}  (${count})` : title;
    doc.fontSize(11).font("Helvetica-Bold").fillColor(DARK).text(label.toUpperCase(), { characterSpacing: 0.5 });
    doc.moveDown(0.15);
    doc.moveTo(margin, doc.y).lineTo(pageW - margin, doc.y).lineWidth(1).strokeColor(GOLD).stroke();
    doc.moveDown(0.4);
    doc.fillColor("#111111").fontSize(10).font("Helvetica");
  };

  const row = (cols: string[], widths: number[]) => {
    let x = margin;
    cols.forEach((c, i) => {
      doc.text(c, x, doc.y, { width: widths[i], lineBreak: false });
      x += widths[i];
    });
    doc.moveDown(0.6);
  };

  // ── 1. Must-Win ────────────────────────────────────────────────────────
  section("Must-Win Opportunities", mustWin.length);
  if (mustWin.length === 0) {
    doc.fillColor("#888888").text("No Must-Win deals in the pipeline.").fillColor("#111111");
  } else {
    doc.font("Helvetica-Bold");
    row(["Code", "Name", "Stage", "Open Actions"], [60, 220, 140, 80]);
    doc.font("Helvetica");
    for (const t of mustWin) {
      row([
        t.targetCode ?? "",
        t.projectName,
        t.currentStage ?? "Sourcing",
        String(openCountByTarget.get(t.id) ?? 0),
      ], [60, 220, 140, 80]);
    }
  }

  // ── 2. Needs Attention ─────────────────────────────────────────────────
  section("Needs Attention", needsAttention.length);
  if (needsAttention.length === 0) {
    doc.fillColor("#888888").text("No deals flagged.").fillColor("#111111");
  } else {
    doc.font("Helvetica-Bold");
    row(["Code", "Name", "Stage", "Tier"], [60, 230, 140, 70]);
    doc.font("Helvetica");
    for (const t of needsAttention) {
      row([
        t.targetCode ?? "",
        t.projectName,
        t.currentStage ?? "Sourcing",
        t.priorityTier,
      ], [60, 230, 140, 70]);
    }
  }

  // ── 3. Overdue Actions ─────────────────────────────────────────────────
  section("Overdue Actions", overdueActions.length);
  if (overdueActions.length === 0) {
    doc.fillColor("#888888").text("No overdue actions.").fillColor("#111111");
  } else {
    doc.font("Helvetica-Bold");
    row(["Deal", "Action", "Owner", "Due"], [80, 240, 100, 80]);
    doc.font("Helvetica");
    for (const a of overdueActions.slice(0, 20)) {
      row([
        a.targetCode ?? a.targetName?.slice(0, 10) ?? "",
        (a.description ?? "").slice(0, 48),
        a.owner ?? "",
        a.dueDate ? String(a.dueDate).slice(0, 10) : "",
      ], [80, 240, 100, 80]);
    }
    if (overdueActions.length > 20) {
      doc.fillColor("#888888").fontSize(9).text(`+ ${overdueActions.length - 20} more`).fillColor("#111111").fontSize(10);
    }
  }

  // ── 4. Due This Week ───────────────────────────────────────────────────
  section("Actions Due This Week", dueThisWeek.length);
  if (dueThisWeek.length === 0) {
    doc.fillColor("#888888").text("No actions due this week.").fillColor("#111111");
  } else {
    doc.font("Helvetica-Bold");
    row(["Deal", "Action", "Owner", "Due"], [80, 240, 100, 80]);
    doc.font("Helvetica");
    for (const a of dueThisWeek.slice(0, 20)) {
      row([
        a.targetCode ?? a.targetName?.slice(0, 10) ?? "",
        (a.description ?? "").slice(0, 48),
        a.owner ?? "",
        a.dueDate ? String(a.dueDate).slice(0, 10) : "",
      ], [80, 240, 100, 80]);
    }
  }

  // ── 5. Stage Changes (7 days) ─────────────────────────────────────────
  section("Stage Changes – Last 7 Days", recentStageChanges.length);
  if (recentStageChanges.length === 0) {
    doc.fillColor("#888888").text("No stage changes in the last 7 days.").fillColor("#111111");
  } else {
    doc.font("Helvetica-Bold");
    row(["Code", "Name", "From", "To", "By"], [60, 180, 100, 100, 60]);
    doc.font("Helvetica");
    for (const s of recentStageChanges) {
      row([
        s.targetCode ?? "",
        (s.targetName ?? "").slice(0, 28),
        s.previousStage ?? "",
        s.newStage ?? "",
        (s.changedBy ?? "").slice(0, 10),
      ], [60, 180, 100, 100, 60]);
    }
  }

  // ── Footer on every page ───────────────────────────────────────────────
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor("#AAAAAA")
       .text(
         `Weekly Deal Review  ·  ${weekStr}  ·  CONFIDENTIAL  ·  Page ${i + 1} of ${pages.count}`,
         margin, doc.page.height - 38, { width: contentW, align: "center" },
       );
  }

  doc.end();
});

export default router;
