import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, sessionBlocklistTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";

export interface JwtClaims {
  userId: string;
  companyId: string;
  email: string;
  role: string;
  jti: string;
}

declare global {
  namespace Express {
    interface Request {
      jwtClaims?: JwtClaims;
    }
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;
  return header.slice(prefix.length);
}

/** Middleware factory — ensures the authenticated user has one of the allowed roles.
 *  Must be used after requireAppPassword (which populates req.jwtClaims).
 *  Legacy sessions without JWT claims are rejected unless allowLegacy is true. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const claims = req.jwtClaims;
    if (!claims) {
      // No JWT — reject; legacy APP_PASSWORD sessions cannot carry role info
      return res.status(403).json({ error: "A signed-in account is required for this action." });
    }
    if (!roles.includes(claims.role)) {
      return res.status(403).json({ error: `This action requires one of the following roles: ${roles.join(", ")}.` });
    }
    return next();
  };
}

export async function requireAppPassword(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") return next();
  if (req.path === "/healthz" || req.path.startsWith("/auth/")) return next();

  const expectedPassword = process.env.APP_PASSWORD;
  const bearerToken = extractBearerToken(req.get("authorization"));
  const headerPassword = req.get("x-app-password") ?? null;

  // 1. Try JWT verification
  if (bearerToken && bearerToken !== expectedPassword) {
    try {
      const claims = jwt.verify(bearerToken, JWT_SECRET) as JwtClaims;
      // Check session blocklist (logout revocation)
      const [blocked] = await db
        .select({ id: sessionBlocklistTable.id })
        .from(sessionBlocklistTable)
        .where(eq(sessionBlocklistTable.jti, claims.jti))
        .limit(1);
      if (blocked) return res.status(401).json({ error: "Session has been revoked. Please log in again." });
      req.jwtClaims = claims;
      return next();
    } catch {
      // Fall through to legacy check
    }
  }

  // 2. Legacy shared-password fallback (for existing sessions stored in localStorage)
  if (!expectedPassword) {
    return res.status(500).json({ error: "APP_PASSWORD is not configured in Replit Secrets." });
  }
  if (bearerToken === expectedPassword || headerPassword === expectedPassword) {
    return next();
  }

  return res.status(401).json({ error: "Authentication required." });
}
