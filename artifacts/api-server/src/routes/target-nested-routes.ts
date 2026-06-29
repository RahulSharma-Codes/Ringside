import { Router } from "express";
import { eq, and, desc, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  targetsTable,
  actionItemsTable,
  interactionsTable,
  stageChangeLogTable,
  dealDocumentsTable,
  icSessionsTable,
  valuationsTable,
  synergiesTable,
  dealEconomicsTable,
  ndaRecordsTable,
  regulatoryClearancesTable,
  dealAdvisorsTable,
  dealSponsorsTable,
} from "@workspace/db";
import { z } from "zod";
import { CreateDiligenceItemBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { writeAuditEvent } from "./audit";
import { toIso, toDateString, formatAction, formatInteraction, formatStageChange } from "./target-helpers";

const router = Router({ mergeParams: true });

function id(req: { params: Record<string, string | string[]> }): number {
  return parseInt(req.params.id as string, 10);
}

// ── Diligence ─────────────────────────────────────────────────────────────────

router.get("/:id/diligence", async (req, res) => {
  const targetId = id(req);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items = await db
    .select()
    .from(actionItemsTable)
    .where(and(eq(actionItemsTable.targetId, targetId), isNotNull(actionItemsTable.workstream)));

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

router.post("/:id/diligence", async (req, res) => {
  const targetId = id(req);
  const parsed = CreateDiligenceItemBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
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

  await db.update(targetsTable).set({ updatedAt: now }).where(eq(targetsTable.id, targetId));

  return res.status(201).json(formatAction(item));
});

// ── Activity Feed ─────────────────────────────────────────────────────────────

router.get("/:id/activity", async (req, res) => {
  const targetId = id(req);

  const [stageChanges, interactions, allActions, completedDiligence, documents] =
    await Promise.all([
      db.select().from(stageChangeLogTable).where(eq(stageChangeLogTable.targetId, targetId)).orderBy(desc(stageChangeLogTable.changedAt)),
      db.select().from(interactionsTable).where(eq(interactionsTable.targetId, targetId)).orderBy(desc(interactionsTable.interactionDatetime)),
      db.select().from(actionItemsTable).where(and(eq(actionItemsTable.targetId, targetId), isNull(actionItemsTable.workstream))).orderBy(desc(actionItemsTable.createdAt)),
      db.select().from(actionItemsTable).where(and(eq(actionItemsTable.targetId, targetId), eq(actionItemsTable.status, "Completed"), isNotNull(actionItemsTable.workstream))).orderBy(desc(actionItemsTable.completedAt)),
      db.select().from(dealDocumentsTable).where(eq(dealDocumentsTable.targetId, targetId)).orderBy(desc(dealDocumentsTable.createdAt)),
    ]);

  type ActivityEvent = { type: string; timestamp: string; title: string; detail: string | null };
  const events: ActivityEvent[] = [];

  for (const sc of stageChanges) {
    const ts = toIso(sc.changedAt);
    if (!ts) continue;
    events.push({ type: "stage_changed", timestamp: ts, title: sc.previousStage ? `Stage changed: ${sc.previousStage} → ${sc.newStage}` : `Added to pipeline at ${sc.newStage}`, detail: sc.changeReason ?? null });
  }
  for (const inter of interactions) {
    const ts = toIso(inter.interactionDatetime);
    if (!ts) continue;
    events.push({ type: "interaction", timestamp: ts, title: `${inter.interactionType ?? "Interaction"} logged`, detail: inter.summary ? inter.summary.slice(0, 120) : null });
  }
  for (const action of allActions) {
    const createdTs = toIso(action.createdAt);
    if (createdTs) events.push({ type: "action_created", timestamp: createdTs, title: `Action added: ${action.description}`, detail: action.owner ? `Owner: ${action.owner}` : null });
    if (action.status === "Completed") {
      const completedTs = toIso(action.completedAt) ?? toIso(action.createdAt);
      if (completedTs) events.push({ type: "action_completed", timestamp: completedTs, title: `Action completed: ${action.description}`, detail: action.owner ? `Owner: ${action.owner}` : null });
    }
  }
  for (const item of completedDiligence) {
    const ts = toIso(item.completedAt) ?? toIso(item.createdAt);
    if (!ts) continue;
    events.push({ type: "diligence_completed", timestamp: ts, title: `Diligence item completed: ${item.description}`, detail: item.workstream ? `Workstream: ${item.workstream}` : null });
  }
  for (const doc of documents) {
    const ts = toIso((doc as unknown as { uploadedAt?: Date | string | null }).uploadedAt) ?? toIso(doc.createdAt);
    if (!ts) continue;
    events.push({ type: "document_uploaded", timestamp: ts, title: `Document added: ${doc.title}`, detail: doc.documentType !== "Other" ? doc.documentType : null });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return res.json(events.slice(0, 200));
});

// ── Documents ─────────────────────────────────────────────────────────────────

const HIGHLY_RESTRICTED_DOC_TYPES = new Set(["IC Memo", "Definitive Agreement"]);

const CreateDocumentBodySchema = z.object({
  title: z.string().min(1),
  documentType: z.string().optional(),
  status: z.string().optional(),
  classification: z.string().optional(),
  owner: z.string().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  workstream: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/:id/documents", async (req, res) => {
  const targetId = id(req);
  const docs = await db.select().from(dealDocumentsTable).where(eq(dealDocumentsTable.targetId, targetId)).orderBy(desc(dealDocumentsTable.createdAt));
  return res.json(
    docs.map((d) => ({
      ...d,
      documentDate: d.documentDate ? String(d.documentDate).slice(0, 10) : null,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : new Date(d.createdAt).toISOString(),
      updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : new Date(d.updatedAt).toISOString(),
    })),
  );
});

router.post("/:id/documents", async (req, res) => {
  const targetId = id(req);
  const parsed = CreateDocumentBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const docType = d.documentType ?? "Other";
  const defaultClassification = HIGHLY_RESTRICTED_DOC_TYPES.has(docType) ? "Highly-Restricted" : "Restricted";
  const now = new Date();
  const [doc] = await db
    .insert(dealDocumentsTable)
    .values({
      targetId, title: d.title, documentType: docType,
      status: d.status ?? "Requested",
      classification: d.classification ?? defaultClassification,
      owner: d.owner ?? null, documentDate: d.documentDate ?? null,
      url: d.url ?? null, workstream: d.workstream ?? null, notes: d.notes ?? null,
      createdAt: now, updatedAt: now,
    })
    .returning();
  await writeAuditEvent("document_uploaded", targetId, d.owner ?? null, { documentId: doc.id, title: doc.title, documentType: doc.documentType });
  return res.status(201).json({
    ...doc,
    documentDate: doc.documentDate ? String(doc.documentDate).slice(0, 10) : null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date(doc.createdAt).toISOString(),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : new Date(doc.updatedAt).toISOString(),
  });
});

// ── IC Sessions ───────────────────────────────────────────────────────────────

const IC_OUTCOMES = ["Approved", "Conditional", "Rejected", "Deferred"] as const;

const CreateIcSessionBodySchema = z.object({
  sessionDate: z.string().min(1),
  attendees: z.string().nullable().optional(),
  outcome: z.enum(IC_OUTCOMES),
  conditions: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

function formatIcSession(s: typeof icSessionsTable.$inferSelect) {
  return { ...s, sessionDate: s.sessionDate ? String(s.sessionDate).slice(0, 10) : null, createdAt: toIso(s.createdAt) };
}

router.get("/:id/ic-sessions", async (req, res) => {
  const targetId = id(req);
  const sessions = await db.select().from(icSessionsTable).where(eq(icSessionsTable.targetId, targetId)).orderBy(desc(icSessionsTable.sessionDate), desc(icSessionsTable.createdAt));
  return res.json(sessions.map(formatIcSession));
});

router.post("/:id/ic-sessions", requireRole("Admin", "Deal Lead"), async (req, res) => {
  const targetId = id(req);
  const parsed = CreateIcSessionBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const now = new Date();
  const [session] = await db
    .insert(icSessionsTable)
    .values({ targetId, sessionDate: d.sessionDate, attendees: d.attendees ?? null, outcome: d.outcome, conditions: d.conditions ?? null, notes: d.notes ?? null, createdAt: now })
    .returning();
  await writeAuditEvent("ic_decision_recorded", targetId, d.attendees ?? null, { sessionId: session.id, outcome: session.outcome, sessionDate: session.sessionDate });
  return res.status(201).json(formatIcSession(session));
});

// ── Valuations ────────────────────────────────────────────────────────────────

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
  return { ...v, recordedAt: toIso(v.recordedAt) };
}

router.get("/:id/valuations", async (req, res) => {
  const targetId = id(req);
  const rows = await db.select().from(valuationsTable).where(eq(valuationsTable.targetId, targetId)).orderBy(desc(valuationsTable.recordedAt));
  return res.json(rows.map(formatValuation));
});

router.post("/:id/valuations", async (req, res) => {
  const targetId = id(req);
  const parsed = CreateValuationBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const existing = await db.select({ version: valuationsTable.version }).from(valuationsTable).where(eq(valuationsTable.targetId, targetId)).orderBy(desc(valuationsTable.version)).limit(1);
  const nextVersion = existing.length > 0 ? (existing[0]!.version + 1) : 1;
  const now = new Date();
  const [row] = await db
    .insert(valuationsTable)
    .values({ targetId, version: nextVersion, methodology: d.methodology, valueLow: d.valueLow ?? null, valuePoint: d.valuePoint ?? null, valueHigh: d.valueHigh ?? null, currency: d.currency ?? "USD", stageAtRecord: d.stageAtRecord ?? null, notes: d.notes ?? null, recordedBy: d.recordedBy ?? null, recordedAt: now })
    .returning();
  await writeAuditEvent("valuation_recorded", targetId, d.recordedBy ?? null, { valuationId: row.id, methodology: row.methodology, valuePoint: row.valuePoint, currency: row.currency, version: row.version });
  return res.status(201).json(formatValuation(row));
});

// ── Synergies ─────────────────────────────────────────────────────────────────

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
  return { ...s, createdAt: toIso(s.createdAt), updatedAt: toIso(s.updatedAt) };
}

router.get("/:id/synergies", async (req, res) => {
  const targetId = id(req);
  const rows = await db.select().from(synergiesTable).where(eq(synergiesTable.targetId, targetId)).orderBy(desc(synergiesTable.createdAt));
  return res.json(rows.map(formatSynergy));
});

router.post("/:id/synergies", async (req, res) => {
  const targetId = id(req);
  const parsed = CreateSynergyBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const now = new Date();
  const [row] = await db
    .insert(synergiesTable)
    .values({ targetId, type: d.type, description: d.description, fy1: d.fy1 ?? null, fy2: d.fy2 ?? null, fy3: d.fy3 ?? null, fy4: d.fy4 ?? null, fy5: d.fy5 ?? null, oneTimeCost: d.oneTimeCost ?? null, confidence: d.confidence, ownerName: d.ownerName ?? null, realisationStartMonth: d.realisationStartMonth ?? null, realisationStatus: d.realisationStatus ?? "Not Started", isDisynergy: d.isDisynergy ?? false, createdAt: now, updatedAt: now })
    .returning();
  await writeAuditEvent("synergy_recorded", targetId, d.ownerName ?? null, { synergyId: row.id, type: row.type, description: row.description, confidence: row.confidence, isDisynergy: row.isDisynergy });
  return res.status(201).json(formatSynergy(row));
});

// ── Deal Economics ────────────────────────────────────────────────────────────

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
  return { ...e, updatedAt: toIso(e.updatedAt) };
}

router.get("/:id/economics", async (req, res) => {
  const targetId = id(req);
  const [row] = await db.select().from(dealEconomicsTable).where(eq(dealEconomicsTable.targetId, targetId)).limit(1);
  if (!row) return res.json({ id: 0, targetId, updatedAt: null });
  return res.json(formatEconomics(row));
});

router.put("/:id/economics", async (req, res) => {
  const targetId = id(req);
  const parsed = UpsertEconomicsBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const now = new Date();
  const existing = await db.select({ id: dealEconomicsTable.id }).from(dealEconomicsTable).where(eq(dealEconomicsTable.targetId, targetId)).limit(1);
  const vals = { cashPct: d.cashPct ?? null, equityPct: d.equityPct ?? null, earnoutPct: d.earnoutPct ?? null, deferredPct: d.deferredPct ?? null, escrowPct: d.escrowPct ?? null, totalEv: d.totalEv ?? null, totalEquityValue: d.totalEquityValue ?? null, irrBase: d.irrBase ?? null, irrUpside: d.irrUpside ?? null, irrDownside: d.irrDownside ?? null, moicBase: d.moicBase ?? null, moicUpside: d.moicUpside ?? null, moicDownside: d.moicDownside ?? null, paybackYears: d.paybackYears ?? null, updatedAt: now };
  let row: typeof dealEconomicsTable.$inferSelect;
  if (existing.length > 0) {
    const [updated] = await db.update(dealEconomicsTable).set(vals).where(eq(dealEconomicsTable.targetId, targetId)).returning();
    row = updated;
  } else {
    const [inserted] = await db.insert(dealEconomicsTable).values({ targetId, ...vals }).returning();
    row = inserted;
  }
  return res.json(formatEconomics(row));
});

// ── NDA Records ───────────────────────────────────────────────────────────────

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
  const targetId = id(req);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const rows = await db.select().from(ndaRecordsTable).where(eq(ndaRecordsTable.targetId, targetId)).orderBy(ndaRecordsTable.createdAt);
  return res.json(rows);
});

router.post("/:id/nda-records", async (req, res) => {
  const targetId = id(req);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const parsed = CreateNdaBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db.insert(ndaRecordsTable).values({ targetId, ...parsed.data }).returning();
  await writeAuditEvent("nda_recorded", targetId, null, { ndaId: created.id, counterparty: created.counterparty, scope: created.scope, effectiveDate: created.effectiveDate, expiryDate: created.expiryDate });
  return res.status(201).json(created);
});

// ── Regulatory Clearances ─────────────────────────────────────────────────────

const CLEARANCE_CATEGORIES_CONST = ["Antitrust-CCI", "RBI", "SEBI", "IRDAI", "FEMA-FDI", "DPDP", "Sanctions-PEP", "ABAC", "Other"] as const;
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
  const targetId = id(req);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const rows = await db.select().from(regulatoryClearancesTable).where(eq(regulatoryClearancesTable.targetId, targetId)).orderBy(regulatoryClearancesTable.createdAt);
  return res.json(rows);
});

router.post("/:id/regulatory-clearances", async (req, res) => {
  const targetId = id(req);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const parsed = CreateClearanceBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db.insert(regulatoryClearancesTable).values({ targetId, ...parsed.data }).returning();
  await writeAuditEvent("regulatory_clearance_updated", targetId, created.ownerName ?? null, { clearanceId: created.id, category: created.category, status: created.status, description: created.description });
  return res.status(201).json(created);
});

// ── Counterparty ──────────────────────────────────────────────────────────────

const UpdateCounterpartyBodySchema = z.object({
  cpCin: z.string().nullable().optional(),
  cpFounders: z.string().nullable().optional(),
  cpKeyManagement: z.string().nullable().optional(),
  cpControllingShareholderS: z.string().nullable().optional(),
  cpWebsite: z.string().nullable().optional(),
  cpNotes: z.string().nullable().optional(),
});

router.get("/:id/counterparty", async (req, res) => {
  const targetId = id(req);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const result = await db.execute(
    sql`SELECT id, project_name, legal_name, cp_cin, cp_founders, cp_key_management, cp_controlling_shareholders, cp_website, cp_notes FROM targets WHERE id = ${targetId} LIMIT 1`,
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Target not found" });
  const r = result.rows[0] as Record<string, unknown>;
  return res.json({ id: r.id, projectName: r.project_name, legalName: r.legal_name, cpCin: r.cp_cin, cpFounders: r.cp_founders, cpKeyManagement: r.cp_key_management, cpControllingShareholderS: r.cp_controlling_shareholders, cpWebsite: r.cp_website, cpNotes: r.cp_notes });
});

router.put("/:id/counterparty", async (req, res) => {
  const targetId = id(req);
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
  const result = await db.execute(
    sql`SELECT id, project_name, legal_name, cp_cin, cp_founders, cp_key_management, cp_controlling_shareholders, cp_website, cp_notes FROM targets WHERE id = ${targetId} LIMIT 1`,
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Target not found" });
  const r = result.rows[0] as Record<string, unknown>;
  return res.json({ id: r.id, projectName: r.project_name, legalName: r.legal_name, cpCin: r.cp_cin, cpFounders: r.cp_founders, cpKeyManagement: r.cp_key_management, cpControllingShareholderS: r.cp_controlling_shareholders, cpWebsite: r.cp_website, cpNotes: r.cp_notes });
});

// ── Advisors ──────────────────────────────────────────────────────────────────

const ADVISOR_TYPES_CONST = ["Buy-side Banker", "Sell-side Banker", "Legal Counsel", "Tax Advisor", "Commercial DD", "ESG Advisor", "Cyber DD", "Integration Advisor", "Other"] as const;
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
  const targetId = id(req);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const rows = await db.select().from(dealAdvisorsTable).where(eq(dealAdvisorsTable.targetId, targetId)).orderBy(dealAdvisorsTable.createdAt);
  return res.json(rows);
});

router.post("/:id/advisors", async (req, res) => {
  const targetId = id(req);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const parsed = CreateAdvisorBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db.insert(dealAdvisorsTable).values({ targetId, ...parsed.data }).returning();
  return res.status(201).json(created);
});

// ── Sponsors ──────────────────────────────────────────────────────────────────

const CreateSponsorBodySchema = z.object({
  name: z.string().min(1),
  roleTitle: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.get("/:id/sponsors", async (req, res) => {
  const targetId = id(req);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const rows = await db.select().from(dealSponsorsTable).where(eq(dealSponsorsTable.targetId, targetId)).orderBy(dealSponsorsTable.createdAt);
  return res.json(rows);
});

router.post("/:id/sponsors", async (req, res) => {
  const targetId = id(req);
  if (isNaN(targetId)) return res.status(400).json({ error: "Invalid target id" });
  const parsed = CreateSponsorBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db.insert(dealSponsorsTable).values({ targetId, ...parsed.data }).returning();
  return res.status(201).json(created);
});

export default router;
