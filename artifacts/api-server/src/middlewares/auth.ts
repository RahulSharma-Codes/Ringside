import type { Request, Response, NextFunction } from "express";

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;
  return header.slice(prefix.length);
}

export function requireAppPassword(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") return next();

  // When mounted under /api, req.path is the part after /api.
  if (req.path === "/healthz" || req.path.startsWith("/auth/")) return next();

  const expectedPassword = process.env.APP_PASSWORD;
  if (!expectedPassword) {
    return res.status(500).json({ error: "APP_PASSWORD is not configured in Replit Secrets." });
  }

  const bearerToken = extractBearerToken(req.get("authorization"));
  const headerPassword = req.get("x-app-password") ?? null;

  if (bearerToken === expectedPassword || headerPassword === expectedPassword) {
    return next();
  }

  return res.status(401).json({ error: "Authentication required." });
}
