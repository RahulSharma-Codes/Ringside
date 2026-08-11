import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";

const router = Router();

// GET /api/users — list team members for the deal-owner picker
router.get("/", async (req, res) => {
  const companyId = req.jwtClaims?.companyId ?? "00000000-0000-0000-0000-000000000001";
  const users = await db
    .select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.companyId, companyId))
    .orderBy(usersTable.displayName);
  return res.json(users);
});

export default router;
