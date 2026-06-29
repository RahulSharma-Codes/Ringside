import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import authRouter from "./routes/auth";
import launchRouter from "./routes/launch";
import { requireAppPassword } from "./middlewares/auth";
import { logger } from "./lib/logger";
import { acquireRequestContext } from "@workspace/db";

const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

const app: Express = express();

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRouter);
app.use("/api/launch", launchRouter);

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

app.use("/api", requireAppPassword, companyContextMiddleware, router);

// Error handler — surfaces cause so we can see the underlying Postgres error
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && (err as NodeJS.ErrnoException & { cause?: unknown }).cause;
  const causeMsg = cause instanceof Error ? cause.message : undefined;
  logger.error({ err, cause: causeMsg }, "unhandled error");
  res.status(500).json({ error: message, cause: causeMsg });
});

export default app;
