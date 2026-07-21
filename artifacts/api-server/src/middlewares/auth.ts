import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, sessionBlocklistTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";

/**
 * Returns the JWT signing secret, enforcing a minimum-length requirement.
 * In production: throws immediately (server will not start without a strong secret).
 * In development: logs a loud warning and falls back to a local dev value.
 */
export function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  const MIN_LEN = 32;

  if (!secret || secret.length < MIN_LEN) {
    const msg =
      `SESSION_SECRET is ${secret ? `too short (${secret.length} chars, need ≥${MIN_LEN})` : "not set"}. ` +
      "Set a strong random value in Replit Secrets before deploying.";
    if (process.env.NODE_ENV === "production") {
      // Hard fail — never serve tokens signed with a weak secret in production.
      console.error(`[FATAL] ${msg}`);
      process.exit(1);
    }
    console.warn(`[WARN] ${msg} Using insecure dev fallback.`);
    return "dev-secret-change-me--padding-to-reach-minimum-length-ok";
  }

  return secret;
}

const JWT_SECRET = getJwtSecret();

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
 *  Must be used after requireAuth (which populates req.jwtClaims). */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const claims = req.jwtClaims;
    if (!claims) {
      return res.status(403).json({ error: "A signed-in account is required for this action." });
    }
    if (!roles.includes(claims.role)) {
      return res.status(403).json({ error: `This action requires one of the following roles: ${roles.join(", ")}.` });
    }
    return next();
  };
}

/** Verifies the request carries a valid, non-revoked JWT and attaches its claims to req.jwtClaims.
 *  Per-user password/OTP login are the only ways to obtain a JWT — there is no shared-secret fallback. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") return next();
  if (req.path === "/healthz" || req.path.startsWith("/auth/")) return next();

  const bearerToken = extractBearerToken(req.get("authorization"));
  if (!bearerToken) {
    return res.status(401).json({ error: "Authentication required." });
  }

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
    // Opportunistic cleanup: prune expired blocklist rows (fire-and-forget, never blocks the request)
    db.delete(sessionBlocklistTable)
      .where(lt(sessionBlocklistTable.expiresAt, new Date()))
      .catch(() => { /* ignore cleanup errors */ });
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }
}
