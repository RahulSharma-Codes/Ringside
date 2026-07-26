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

// ── app_rls availability probe ────────────────────────────────────────────────
// Replit's managed Postgres does not always allow the connecting user to
// GRANT itself app_rls membership (requires superuser). When SET ROLE fails
// we degrade gracefully: the company GUC still filters rows for single-tenant
// use, we just lose the extra superuser-bypass protection. The probe result is
// cached after the first attempt so the warning fires exactly once per process.
//
// null  = not yet tested
// true  = SET ROLE app_rls succeeded — full RLS enforcement active
// false = permission denied — running in GUC-only mode, warning already logged
let appRlsAvailable: boolean | null = null;

async function trySetRole(client: pg.PoolClient): Promise<boolean> {
  if (appRlsAvailable === false) return false; // already known to be unavailable
  try {
    await client.query(`SET ROLE app_rls`);
    if (appRlsAvailable === null) appRlsAvailable = true;
    return true;
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 42501 = permission_denied, 42704 = undefined_object (role doesn't exist)
    if (code === "42501" || code === "42704") {
      if (appRlsAvailable === null) {
        appRlsAvailable = false;
        console.warn(
          "[db] WARNING: app_rls role not granted to the connecting user — " +
            "running without role-level RLS isolation. " +
            "GUC-based company filtering (app.company_id) is still active. " +
            "To restore full isolation, grant app_rls to the DB user as a superuser.",
        );
      }
      return false;
    }
    throw err; // unexpected error — bubble up
  }
}

// ── Per-request context acquisition ──────────────────────────────────────────

/**
 * Acquires a dedicated pool client, sets `app.company_id` on it, and
 * optionally switches to the non-superuser `app_rls` role so RLS policies are
 * enforced. Falls back gracefully if the connecting user lacks SET ROLE
 * permission (logs a one-time warning; GUC filtering remains active).
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

  // Set the tenant GUC first (while still superuser — set_config is always allowed).
  await client.query(`SELECT set_config($1, $2, false)`, ["app.company_id", companyId]);

  // Switch to non-superuser role so RLS policies are applied to all queries
  // on this connection for the duration of this request. Degrades gracefully
  // if the role grant is unavailable (managed Postgres restriction).
  const roleSet = await trySetRole(client);

  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      // Restore the superuser role before returning the connection to the pool,
      // so the next borrower (or migration code) gets a clean privileged connection.
      // Fire-and-forget: always release the connection even if RESET ROLE fails.
      const cleanup = roleSet
        ? client.query("RESET ROLE").catch(() => {})
        : Promise.resolve();
      cleanup.finally(() => client.release());
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
 * Runs `fn` inside a PostgreSQL transaction where Row-Level Security is
 * enforced for the given company.
 *
 * Uses the same acquire → GUC → SET ROLE → BEGIN → callback → COMMIT/ROLLBACK
 * → RESET ROLE → release pattern as acquireRequestContext, so there is exactly
 * one RLS mechanism in the codebase.  All db.* calls inside `fn` are routed
 * through the transaction client via the AsyncLocalStorage interceptor.
 */
export async function withRlsTransaction<T>(
  companyId: string,
  fn: () => Promise<T>,
): Promise<T> {
  // pool.connect() is not intercepted — we get a dedicated PoolClient directly.
  const client = await pool.connect();

  try {
    // Apply GUC and role before BEGIN so session-level settings are visible
    // inside the transaction. Degrades gracefully when app_rls is unavailable.
    await client.query(`SELECT set_config($1, $2, false)`, ["app.company_id", companyId]);
    const roleSet = await trySetRole(client);
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
    // Restore the connection to a clean state before returning it to the pool,
    // mirroring the release() pattern in acquireRequestContext.
    // Only RESET ROLE if we actually switched roles — avoids a no-op error
    // when running in GUC-only mode (appRlsAvailable === false).
    if (appRlsAvailable !== false) {
      await client.query("RESET ROLE").catch(() => {});
    }
    client.release();
  }
}

export * from "./schema";
