import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// Liveness probe — always fast, no DB call.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
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
