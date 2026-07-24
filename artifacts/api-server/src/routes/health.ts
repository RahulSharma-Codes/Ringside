import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// Liveness probe — always fast, no DB call.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Database health probe — runs a trivial query to confirm the DB is reachable.
// Protected by PROBE_SECRET env var so it is not exposed to anonymous users
// while remaining callable from internal scheduled checks and monitoring tools.
// Add the X-Probe-Secret header to requests; the endpoint rejects all others.
router.get("/healthz/db", async (req, res) => {
  const probeSecret = process.env.PROBE_SECRET;
  if (!probeSecret) {
    // If no secret is configured the endpoint is disabled — return 501 so
    // callers know to set the env var rather than silently getting a 401.
    return res.status(501).json({
      status: "not_configured",
      detail: "Set the PROBE_SECRET environment variable to enable this endpoint.",
    });
  }
  const incoming = req.headers["x-probe-secret"];
  if (incoming !== probeSecret) {
    return res.status(401).json({ status: "unauthorized" });
  }

  type DbClient = { query(sql: string): Promise<unknown>; release(): void };
  try {
    const client = await (pool.connect() as Promise<DbClient>);
    try {
      await client.query("SELECT 1");
      return res.json({ status: "ok", db: true });
    } finally {
      client.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(503).json({ status: "db_unreachable", db: false, detail: message });
  }
});

// Readiness probe — returns 503 until migrations complete AND the DB is reachable.
// The migrationsComplete flag is set by index.ts via setMigrationsComplete().
let _migrationsComplete = false;
export function setMigrationsComplete(): void {
  _migrationsComplete = true;
}

router.get("/readyz", async (_req, res) => {
  if (!_migrationsComplete) {
    return res.status(503).json({ status: "starting", ready: false });
  }
  // Cast to the promise overload shape so TypeScript doesn't pick the
  // callback overload (which returns void) when inferring client's type.
  type DbClient = { query(sql: string): Promise<unknown>; release(): void };
  try {
    const client = await (pool.connect() as Promise<DbClient>);
    try {
      await client.query("SELECT 1");
      return res.json({ status: "ok", ready: true });
    } finally {
      client.release(); // always release, even when query throws
    }
  } catch {
    return res.status(503).json({ status: "db_unreachable", ready: false });
  }
});

export default router;
