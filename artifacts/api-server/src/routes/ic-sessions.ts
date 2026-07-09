import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { icSessionsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { canAccessTarget } from "../lib/target-access";

const router = Router();

// DELETE /api/ic-sessions/:id — Admin or Deal Lead only
router.delete("/:id", requireRole("Admin", "Deal Lead"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [session] = await db.select().from(icSessionsTable).where(eq(icSessionsTable.id, id)).limit(1);
  if (!session) return res.status(404).json({ error: "Not found" });
  if (!(await canAccessTarget(req, session.targetId))) return res.status(404).json({ error: "Not found" });
  await db.delete(icSessionsTable).where(eq(icSessionsTable.id, id));
  return res.status(204).send();
});

export default router;
