import { AsyncLocalStorage } from "async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function getDatabaseUrl(): string {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    const port = PGPORT ?? "5432";
    return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${port}/${PGDATABASE}`;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set, or PGHOST/PGUSER/PGPASSWORD/PGDATABASE for Replit Postgres.",
    );
  }
  return url;
}

export const pool = new Pool({ connectionString: getDatabaseUrl() });

// ── Per-request client routing ────────────────────────────────────────────────
// Stores the dedicated PoolClient for the current HTTP request so that every
// pool.query() call is routed through it — ensuring the SET app.company_id
// GUC is visible to all Drizzle queries in the request.

const requestClientStorage = new AsyncLocalStorage<pg.PoolClient>();
const requestCompanyStorage = new AsyncLocalStorage<string>();

// Intercept pool.query: when a per-request client is in async context, route
// all queries through that client (which already has app.company_id set).
const originalQuery = pool.query.bind(pool) as (...args: unknown[]) => Promise<pg.QueryResult>;
(pool as unknown as { query: (...args: unknown[]) => Promise<pg.QueryResult> }).query =
  (...args: unknown[]) => {
    const client = requestClientStorage.getStore();
    if (client) {
      return (client.query as (...args: unknown[]) => Promise<pg.QueryResult>)(...args);
    }
    return originalQuery(...args);
  };

// The global db instance — backed by the pool, but queries are transparently
// redirected to the per-request client (with company GUC set) when in context.
export const db = drizzle(pool, { schema });

// ── Per-request context acquisition ──────────────────────────────────────────

/**
 * Acquires a dedicated pool client, sets `app.company_id` on it, and returns
 * helpers to run the request inside the right async context and release the
 * client when done.
 *
 * Usage in Express middleware:
 *   const ctx = await acquireRequestContext(companyId);
 *   res.on('finish', ctx.release);
 *   res.on('close', ctx.release);
 *   ctx.run(next);
 */
export async function acquireRequestContext(companyId: string): Promise<{
  run: (fn: () => void) => void;
  release: () => void;
}> {
  // Use originalQuery trick: we call pool.connect() but need to avoid the
  // intercepted pool.query. pool.connect() is not intercepted so it's fine.
  const client = await pool.connect();
  // Use set_config() with bound parameters to avoid SQL injection from JWT-derived companyId
  await client.query(`SELECT set_config($1, $2, false)`, ["app.company_id", companyId]);

  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      client.release();
    }
  };

  const run = (fn: () => void) => {
    requestClientStorage.run(client, () => {
      requestCompanyStorage.run(companyId, fn);
    });
  };

  return { run, release };
}

/**
 * Returns the company UUID for the current HTTP request, or undefined when
 * called outside a request context (e.g. startup, auth routes, background jobs).
 */
export function getRequestCompanyId(): string | undefined {
  return requestCompanyStorage.getStore();
}

export * from "./schema";
