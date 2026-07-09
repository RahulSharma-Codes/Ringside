import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { valuationsTable } from "@workspace/db";
import { canAccessTarget } from "../lib/target-access";

const router = Router();

// DELETE /api/valuations/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [valuation] = await db.select().from(valuationsTable).where(eq(valuationsTable.id, id)).limit(1);
  if (!valuation) return res.status(404).json({ error: "Not found" });
  if (!(await canAccessTarget(req, valuation.targetId))) return res.status(404).json({ error: "Not found" });
  await db.delete(valuationsTable).where(eq(valuationsTable.id, id));
  return res.status(204).send();
});

export default router;
