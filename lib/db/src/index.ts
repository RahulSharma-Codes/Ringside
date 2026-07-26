import { AsyncLocalStorage } from "async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// SSL is controlled via the PGSSLMODE environment variable, which pg reads
// natively via readSSLConfigFromEnvironment() when no ssl option is passed.
//
// Production: PGSSLMODE=no-verify (set in the production env) → pg enables SSL
//             with rejectUnauthorized: false (accepts self-signed certs).
// Dev:        PGSSLMODE is not set → pg defaults to no SSL → helium works.
//
// We intentionally do NOT set ssl in the Pool config so that pg's native env
// var handling takes over rather than any custom detection logic.

function getPoolConfig(): pg.PoolConfig {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;

  // Prefer individual params when available — avoids pg-connection-string's
  // URL parser from interfering with the connection config.
  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    return {
      host: PGHOST,
      port: PGPORT ? parseInt(PGPORT, 10) : 5432,
      user: PGUSER,
      password: PGPASSWORD,
      database: PGDATABASE,
      // ssl intentionally omitted — pg reads PGSSLMODE from env
    };
  }

  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set, or PGHOST/PGUSER/PGPASSWORD/PGDATABASE for Replit Postgres.",
    );
  }
  return { connectionString: url };
  // ssl intentionally omitted — pg reads PGSSLMODE from env
}

export const pool = new Pool(getPoolConfig());

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
 * Acquires a dedicated pool client, sets `app.company_id` on it so that the
 * RLS company_isolation policies filter rows correctly, and returns helpers to
 * run the request inside the right async context and release the client when done.
 *
 * Pattern: acquire → set GUC → run → release.
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
  // pool.connect() is not intercepted — we get a dedicated PoolClient directly.
  const client = await pool.connect();

  // Set the tenant GUC so RLS company_isolation policies filter rows for this
  // company. set_config is always allowed regardless of the connecting user's
  // privileges.
  await client.query(`SELECT set_config($1, $2, false)`, ["app.company_id", companyId]);

  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      // Return the connection to the pool. The GUC is session-scoped and will
      // be overwritten on the next acquireRequestContext call, so no cleanup
      // is needed beyond releasing the client.
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

/**
 * Runs `fn` inside a PostgreSQL transaction with the company GUC set so RLS
 * policies filter rows correctly. All db.* calls inside `fn` are routed
 * through the transaction client via the AsyncLocalStorage interceptor.
 *
 * Pattern: acquire → set GUC → BEGIN → callback → COMMIT/ROLLBACK → release.
 */
export async function withCompanyTransaction<T>(
  companyId: string,
  fn: () => Promise<T>,
): Promise<T> {
  // pool.connect() is not intercepted — we get a dedicated PoolClient directly.
  const client = await pool.connect();

  try {
    // Set the tenant GUC before BEGIN so it is visible inside the transaction.
    await client.query(`SELECT set_config($1, $2, false)`, ["app.company_id", companyId]);
    await client.query("BEGIN");

    // Override AsyncLocalStorage so all db.* calls inside fn route to this
    // transaction client, respecting the existing per-request interceptor pattern.
    const result = await new Promise<T>((resolve, reject) => {
      requestClientStorage.run(client, () => {
        requestCompanyStorage.run(companyId, () => {
          fn().then(resolve).catch(reject);
        });
      });
    });

    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export * from "./schema";
