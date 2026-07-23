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

// SSL is controlled solely by PGSSLMODE (the standard libpq env var).
//
// We deliberately do NOT force SSL based on NODE_ENV. Replit's bundled
// Postgres (and many dev/CI databases) run WITHOUT SSL; forcing it broke
// every production connection — the pool failed to connect, startup
// migrations retried forever, and every /api request 500'd via
// companyContextMiddleware. That kept the deployment down for >24h.
//
// To enable SSL for a deployment that needs it, set PGSSLMODE=require
// (optionally with PGSSLROOTCERT / rejectUnauthorized handling).
function getSslConfig(): pg.PoolConfig["ssl"] {
  const sslmode = process.env["PGSSLMODE"];
  if (sslmode === "disable") return false;
  if (sslmode === "require" || sslmode === "verify-ca" || sslmode === "verify-full") {
    return { rejectUnauthorized: sslmode === "verify-ca" || sslmode === "verify-full" };
  }
  // prefer / allow / unset → no forced SSL (let the connection succeed).
  return undefined;
}

export const pool = new Pool({
  connectionString: getDatabaseUrl(),
  ssl: getSslConfig(),
});

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
 * Acquires a dedicated pool client, sets `app.company_id` on it, switches to
 * the non-superuser `app_rls` role so that PostgreSQL Row-Level Security
 * policies are enforced, and returns helpers to run the request inside the
 * right async context and release the client when done.
 *
 * WHY app_rls: PostgreSQL superusers bypass RLS unconditionally, even when
 * FORCE ROW LEVEL SECURITY is set. By switching to app_rls (a non-superuser)
 * after acquiring the connection we ensure the company_isolation policy
 * actually filters rows. On release we RESET ROLE so the returned connection
 * is clean for the next borrower.
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
  // on this connection for the duration of this request.
  await client.query(`SET ROLE app_rls`);

  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      // Restore the superuser role before returning the connection to the pool,
      // so the next borrower (or migration code) gets a clean privileged connection.
      // Fire-and-forget: always release the connection even if RESET ROLE fails.
      client.query("RESET ROLE").catch(() => {}).finally(() => client.release());
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
    // inside the transaction.
    await client.query(`SELECT set_config($1, $2, false)`, ["app.company_id", companyId]);
    await client.query(`SET ROLE app_rls`);
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
    await client.query("RESET ROLE").catch(() => {});
    client.release();
  }
}

export * from "./schema";
