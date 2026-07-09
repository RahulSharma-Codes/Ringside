import { Router } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, usersTable, companiesTable, targetAccessTable, targetsTable } from "@workspace/db";
import { grantTargetAccess } from "../lib/target-access";

const router = Router();

const VALID_ROLES = ["Admin", "Deal Lead", "Member", "IC Voter"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

function isValidRole(r: unknown): r is ValidRole {
  return VALID_ROLES.includes(r as ValidRole);
}

async function getDefaultCompany() {
  const [company] = await db
    .select({ id: companiesTable.id, name: companiesTable.name })
    .from(companiesTable)
    .limit(1);
  return company ?? null;
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────

router.get("/users", async (_req, res) => {
  const company = await getDefaultCompany();
  if (!company) return res.status(404).json({ error: "Company not found." });

  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.companyId, company.id));

  return res.json(users);
});

// ── POST /api/admin/users (invite) ────────────────────────────────────────────

router.post("/users", async (req, res) => {
  const company = await getDefaultCompany();
  if (!company) return res.status(404).json({ error: "Company not found." });

  const { email, displayName, role } = req.body ?? {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required." });
  }

  const emailNorm = email.toLowerCase().trim();
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, emailNorm))
    .limit(1);
  if (existing) return res.status(409).json({ error: "A user with that email already exists." });

  const resolvedRole: ValidRole = isValidRole(role) ? role : "Member";

  const [user] = await db
    .insert(usersTable)
    .values({
      companyId: company.id,
      email: emailNorm,
      displayName: displayName ? String(displayName).trim() || null : null,
      role: resolvedRole,
    })
    .returning();

  return res.status(201).json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
  });
});

// ── PUT /api/admin/users/:id ─────────────────────────────────────────────────
// Full update: role + displayName

router.put("/users/:id", async (req, res) => {
  const company = await getDefaultCompany();
  if (!company) return res.status(404).json({ error: "Company not found." });

  const { role, displayName } = req.body ?? {};

  if (role !== undefined && !isValidRole(role)) {
    return res.status(400).json({
      error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.`,
    });
  }

  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates["role"] = role;
  if (displayName !== undefined) updates["displayName"] = displayName ? String(displayName).trim() || null : null;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update." });
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(and(eq(usersTable.id, req.params.id), eq(usersTable.companyId, company.id)))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    });

  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json(user);
});

// ── PUT /api/admin/users/:id/role (legacy path kept for compat) ───────────────

router.put("/users/:id/role", async (req, res) => {
  const company = await getDefaultCompany();
  if (!company) return res.status(404).json({ error: "Company not found." });

  const { role } = req.body ?? {};
  if (!isValidRole(role)) {
    return res.status(400).json({
      error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.`,
    });
  }

  const [user] = await db
    .update(usersTable)
    .set({ role })
    .where(and(eq(usersTable.id, req.params.id), eq(usersTable.companyId, company.id)))
    .returning({ id: usersTable.id, email: usersTable.email, role: usersTable.role });

  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json(user);
});

// ── DELETE /api/admin/users/:id ──────────────────────────────────────────────

router.delete("/users/:id", async (req, res) => {
  const company = await getDefaultCompany();
  if (!company) return res.status(404).json({ error: "Company not found." });

  const [deleted] = await db
    .delete(usersTable)
    .where(and(eq(usersTable.id, req.params.id), eq(usersTable.companyId, company.id)))
    .returning({ id: usersTable.id, email: usersTable.email });

  if (!deleted) return res.status(404).json({ error: "User not found." });
  return res.json({ deleted: true, id: deleted.id, email: deleted.email });
});

// ── Per-user deal access management ──────────────────────────────────────────

// GET /api/admin/users/:id/access — target ids this user has been granted access to
router.get("/users/:id/access", async (req, res) => {
  const rows = await db
    .select({ targetId: targetAccessTable.targetId })
    .from(targetAccessTable)
    .where(eq(targetAccessTable.userId, req.params.id));
  return res.json({ targetIds: rows.map((r) => r.targetId) });
});

// PUT /api/admin/users/:id/access — replace the full set of granted target ids for this user
router.put("/users/:id/access", async (req, res) => {
  const userId = req.params.id;
  const { targetIds } = req.body ?? {};
  if (!Array.isArray(targetIds) || !targetIds.every((t) => typeof t === "number")) {
    return res.status(400).json({ error: "targetIds must be an array of numbers." });
  }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return res.status(404).json({ error: "User not found." });

  const existing = await db
    .select({ targetId: targetAccessTable.targetId })
    .from(targetAccessTable)
    .where(eq(targetAccessTable.userId, userId));
  const existingIds = new Set(existing.map((r) => r.targetId));
  const desiredIds = new Set<number>(targetIds);

  const toRevoke = [...existingIds].filter((id) => !desiredIds.has(id));
  const toGrant = [...desiredIds].filter((id) => !existingIds.has(id));

  if (toRevoke.length > 0) {
    await db.delete(targetAccessTable).where(
      and(eq(targetAccessTable.userId, userId), inArray(targetAccessTable.targetId, toRevoke)),
    );
  }
  for (const targetId of toGrant) {
    const [target] = await db.select({ id: targetsTable.id }).from(targetsTable).where(eq(targetsTable.id, targetId));
    if (target) await grantTargetAccess(targetId, userId, req.jwtClaims?.userId ?? null);
  }

  return res.json({ targetIds: [...desiredIds] });
});

export default router;
