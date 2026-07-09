import type { Request } from "express";
import { eq, and } from "drizzle-orm";
import { db, targetAccessTable, usersTable } from "@workspace/db";

export interface AccessScope {
  /** true when the caller is an Admin — no visibility restriction applies */
  isAdmin: boolean;
  userId: string | null;
  /** Ids of targets the current user has been explicitly granted access to.
   *  Only meaningful when isAdmin is false. */
  accessibleTargetIds: number[];
}

async function getCurrentUserRecord(req: Request) {
  const email = req.jwtClaims?.email?.toLowerCase();
  if (!email) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  return user ?? null;
}

/** Resolves the current request's deal-visibility scope.
 *  Admins get isAdmin=true (unrestricted). Everyone else gets the list of
 *  target ids explicitly granted to them via target_access. */
export async function getAccessScope(req: Request): Promise<AccessScope> {
  const user = await getCurrentUserRecord(req);
  if (!user) return { isAdmin: false, userId: null, accessibleTargetIds: [] };
  if (user.role === "Admin") return { isAdmin: true, userId: user.id, accessibleTargetIds: [] };

  const rows = await db
    .select({ targetId: targetAccessTable.targetId })
    .from(targetAccessTable)
    .where(eq(targetAccessTable.userId, user.id));

  return { isAdmin: false, userId: user.id, accessibleTargetIds: rows.map((r) => r.targetId) };
}

/** Returns true if the current request's user may view the given target. */
export async function canAccessTarget(req: Request, targetId: number): Promise<boolean> {
  const scope = await getAccessScope(req);
  if (scope.isAdmin) return true;
  if (!scope.userId) return false;
  return scope.accessibleTargetIds.includes(targetId);
}

/** Grants a user access to a target. Idempotent (ON CONFLICT DO NOTHING semantics via check-then-insert). */
export async function grantTargetAccess(targetId: number, userId: string, grantedBy: string | null): Promise<void> {
  const [existing] = await db
    .select({ id: targetAccessTable.id })
    .from(targetAccessTable)
    .where(and(eq(targetAccessTable.targetId, targetId), eq(targetAccessTable.userId, userId)))
    .limit(1);
  if (existing) return;
  await db.insert(targetAccessTable).values({ targetId, userId, grantedBy });
}
