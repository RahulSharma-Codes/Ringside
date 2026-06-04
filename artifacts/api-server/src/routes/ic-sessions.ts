import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { icSessionsTable } from "@workspace/db";

const router = Router();

// DELETE /api/ic-sessions/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db.delete(icSessionsTable).where(eq(icSessionsTable.id, id));
  return res.status(204).send();
});

export default router;
