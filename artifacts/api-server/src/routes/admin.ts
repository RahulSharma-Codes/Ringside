import { Router } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usersTable, companiesTable } from "@workspace/db";

const router = Router();

async function getDefaultCompany() {
  const [company] = await db.select({ id: companiesTable.id, name: companiesTable.name })
    .from(companiesTable).limit(1);
  return company ?? null;
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────

router.get("/users", async (_req, res) => {
  const company = await getDefaultCompany();
  if (!company) return res.status(404).json({ error: "Company not found." });

  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    displayName: usersTable.displayName,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.companyId, company.id));

  return res.json(users);
});

// ── POST /api/admin/users (invite) ────────────────────────────────────────────

router.post("/users", async (req, res) => {
  const company = await getDefaultCompany();
  if (!company) return res.status(404).json({ error: "Company not found." });

  const { email, displayName, role, temporaryPassword } = req.body ?? {};
  if (!email || typeof email !== "string") return res.status(400).json({ error: "email required." });

  const emailNorm = email.toLowerCase().trim();
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.email, emailNorm)).limit(1);
  if (existing) return res.status(409).json({ error: "User already exists." });

  let passwordHash: string | null = null;
  if (temporaryPassword) {
    passwordHash = await bcrypt.hash(String(temporaryPassword), 10);
  }

  const [user] = await db.insert(usersTable).values({
    companyId: company.id,
    email: emailNorm,
    displayName: displayName ? String(displayName) : null,
    role: ["Admin", "Member", "Viewer"].includes(role) ? role : "Member",
    passwordHash,
  }).returning();

  return res.status(201).json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
  });
});

// ── PUT /api/admin/users/:id/role ────────────────────────────────────────────

router.put("/users/:id/role", async (req, res) => {
  const company = await getDefaultCompany();
  if (!company) return res.status(404).json({ error: "Company not found." });

  const { role } = req.body ?? {};
  if (!["Admin", "Member", "Viewer"].includes(role)) {
    return res.status(400).json({ error: "Invalid role. Must be Admin, Member, or Viewer." });
  }

  const [user] = await db.update(usersTable)
    .set({ role })
    .where(and(eq(usersTable.id, req.params.id), eq(usersTable.companyId, company.id)))
    .returning({ id: usersTable.id, email: usersTable.email, role: usersTable.role });

  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json(user);
});

export default router;
