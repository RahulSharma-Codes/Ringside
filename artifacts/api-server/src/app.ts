import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import authRouter from "./routes/auth";
import launchRouter from "./routes/launch";
import { requireAuth } from "./middlewares/auth";
import { logger } from "./lib/logger";
import { acquireRequestContext } from "@workspace/db";

const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

const app: Express = express();

// Trust the Replit reverse-proxy so X-Forwarded-For is correctly forwarded
// to express-rate-limit (avoids ERR_ERL_UNEXPECTED_X_FORWARDED_FOR in preview).
app.set("trust proxy", 1);

// ── Security headers (helmet) ─────────────────────────────────────────────────
// contentSecurityPolicy disabled — the Vite frontend manages its own CSP.
// crossOriginEmbedderPolicy disabled — Replit preview uses cross-origin iframes.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production (REPLIT_DOMAINS is set) only allow requests from known Replit
// preview/deploy domains.  In dev (no REPLIT_DOMAINS) allow all origins so
// local tools (curl, Postman, Vite HMR) work without friction.
// http://localhost (with or without port) is always allowed — it is only
// reachable from the machine itself and is needed for Playwright E2E tests
// which run a headless Chromium browser that sends Origin: http://localhost.
function buildAllowedOrigins(): RegExp[] {
  const raw = process.env.REPLIT_DOMAINS ?? "";
  const always: RegExp[] = [
    /^http:\/\/localhost(:\d+)?$/, // localhost dev + Playwright headless browser
  ];
  if (!raw) return [];
  return [
    ...always,
    ...raw
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean)
      .flatMap((d) => {
        const escaped = d.replace(/\./g, "\\.");
        return [
          new RegExp(`^https://${escaped}$`),
          // Also allow any *.replit.app deploy domain
          /^https:\/\/[\w-]+\.replit\.app$/,
        ];
      }),
  ];
}

const allowedOrigins = buildAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // server-to-server / curl
      if (allowedOrigins.length === 0) return callback(null, true); // dev — allow all
      if (allowedOrigins.some((r) => r.test(origin))) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Auth routes: 30 req / 15 min per IP (protects OTP and password brute-force).
// OIDC callback and state routes are exempt since they're read-only redirects.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path === "/state" ||
    req.path === "/smtp/status" ||
    req.path.startsWith("/oidc/"),
  message: { error: "Too many requests from this IP. Please try again later." },
});

// General API: 300 req / min per IP — generous enough for normal use.
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

// ── Request logging ────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRateLimiter, authRouter);
app.use("/api/launch", launchRouter);
app.use("/api", apiRateLimiter);

/**
 * Per-request company context middleware.
 * Acquires a dedicated pool client, sets `app.company_id` on that connection,
 * then runs the rest of the request inside an AsyncLocalStorage context so
 * every `db.*` call in route handlers uses the same connection — making the
 * GUC visible for RLS enforcement.
 */
async function companyContextMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS" || req.path === "/healthz" || req.path.startsWith("/auth/")) {
    return next();
  }

  const companyId = req.jwtClaims?.companyId ?? DEFAULT_COMPANY_ID;

  try {
    const ctx = await acquireRequestContext(companyId);
    res.on("finish", ctx.release);
    res.on("close", ctx.release);
    ctx.run(next);
  } catch (err) {
    next(err);
  }
}

app.use("/api", requireAuth, companyContextMiddleware, router);

// Error handler — logs full detail server-side; returns a generic message to
// the client so internal Postgres errors and stack traces are never exposed.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && (err as NodeJS.ErrnoException & { cause?: unknown }).cause;
  const causeMsg = cause instanceof Error ? cause.message : undefined;
  logger.error({ err, cause: causeMsg }, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
