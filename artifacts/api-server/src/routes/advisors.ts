import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { dealAdvisorsTable, advisorConflictNotesTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const ADVISOR_TYPES = [
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

const CONFLICTS_STATUSES = ["Pending", "Cleared", "Flagged"] as const;
const SIDES = ["buy-side", "sell-side"] as const;

export { ADVISOR_TYPES, CONFLICTS_STATUSES, SIDES };

const UpdateAdvisorBodySchema = z.object({
  side: z.enum(SIDES).optional(),
  advisorType: z.enum(ADVISOR_TYPES).optional(),
  firmName: z.string().min(1).optional(),
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  engagementDate: z.string().nullable().optional(),
  feeStructure: z.string().nullable().optional(),
  conflictsStatus: z.enum(CONFLICTS_STATUSES).optional(),
  notes: z.string().nullable().optional(),
});

// PUT /api/advisors/:id
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = UpdateAdvisorBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [updated] = await db
    .update(dealAdvisorsTable)
    .set(parsed.data)
    .where(eq(dealAdvisorsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Advisor not found" });
  return res.json(updated);
});

// DELETE /api/advisors/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [deleted] = await db
    .delete(dealAdvisorsTable)
    .where(eq(dealAdvisorsTable.id, id))
    .returning();
  if (!deleted) return res.status(404).json({ error: "Advisor not found" });
  return res.status(204).end();
});

const CreateConflictNoteBodySchema = z.object({
  note: z.string().min(1),
  author: z.string().min(1),
  statusAtTime: z.enum(CONFLICTS_STATUSES),
});

// GET /api/advisors/:id/conflict-notes
router.get("/:id/conflict-notes", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const advisor = await db.query.dealAdvisorsTable.findFirst({ where: eq(dealAdvisorsTable.id, id) });
  if (!advisor) return res.status(404).json({ error: "Advisor not found" });
  const notes = await db
    .select()
    .from(advisorConflictNotesTable)
    .where(eq(advisorConflictNotesTable.advisorId, id))
    .orderBy(advisorConflictNotesTable.createdAt);
  return res.json(notes);
});

// POST /api/advisors/:id/conflict-notes
router.post("/:id/conflict-notes", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const advisor = await db.query.dealAdvisorsTable.findFirst({ where: eq(dealAdvisorsTable.id, id) });
  if (!advisor) return res.status(404).json({ error: "Advisor not found" });
  const parsed = CreateConflictNoteBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [created] = await db
    .insert(advisorConflictNotesTable)
    .values({ advisorId: id, ...parsed.data })
    .returning();
  return res.status(201).json(created);
});

export default router;
