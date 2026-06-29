import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { icSessionsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router = Router();

// DELETE /api/ic-sessions/:id — Admin or Deal Lead only
router.delete("/:id", requireRole("Admin", "Deal Lead"), async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(icSessionsTable).where(eq(icSessionsTable.id, id));
  return res.status(204).send();
});

export default router;
