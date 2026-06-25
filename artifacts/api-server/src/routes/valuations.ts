import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { valuationsTable } from "@workspace/db";

const router = Router();

// DELETE /api/valuations/:id
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await db.delete(valuationsTable).where(eq(valuationsTable.id, id));
  return res.status(204).send();
});

export default router;
