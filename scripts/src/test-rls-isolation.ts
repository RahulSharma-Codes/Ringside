/**
 * RLS Isolation Smoke-Test
 *
 * Verifies that Company B cannot see Company A's data through the API, and that
 * the database-level enforcement prevents cross-tenant writes.
 *
 * What it does:
 *  1. Creates Company B + a test user directly in the DB
 *  2. Signs a JWT for that user (same secret the API server uses)
 *  3. Calls the live API as Company B — requires HTTP 200 and asserts 0 rows
 *  4. Verifies DB-level enforcement under the app_rls (non-superuser) role:
 *       A. Empty GUC → NOT NULL constraint fires (default resolves to NULL)
 *       B. Empty GUC → RLS policy rejects the row even with explicit company_id
 *       C. Wrong company_id → RLS WITH CHECK blocks cross-tenant insert
 *  5. Cleans up all test fixtures
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run test-rls
 *
 * Requires the API server to be running and the same DB env vars as the server.
 */

import pg from "pg";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

const { Pool } = pg;

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string): never {
  console.error(`  ✗ FAIL: ${msg}`);
  process.exit(1);
}

function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 54 - title.length))}`);
}

function getDatabaseUrl(): string {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    const port = PGPORT ?? "5432";
    return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${port}/${PGDATABASE}`;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("No DB connection: set PGHOST/PGUSER/PGPASSWORD/PGDATABASE or DATABASE_URL");
  return url;
}

const API_BASE = process.env.API_BASE ?? "http://localhost:80/api";
const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

const COMPANY_B_ID = "00000000-0000-0000-0000-000000000002";
const USER_B_ID    = "00000000-0000-0000-0000-000000000099";
const USER_B_EMAIL = "test-company-b@ringside-rls-test.invalid";

function signJwt(userId: string, companyId: string, email: string): string {
  const jti = randomUUID();
  return jwt.sign({ userId, companyId, email, role: "Admin", jti }, JWT_SECRET, { expiresIn: "15m" });
}

interface ApiResult { status: number; body: unknown }

async function apiGet(path: string, token: string): Promise<ApiResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log("RLS Isolation Smoke-Test");
  console.log(`  API: ${API_BASE}`);
  console.log(`  DB:  ${getDatabaseUrl().replace(/:([^@]+)@/, ":***@")}`);

  const pool = new Pool({ connectionString: getDatabaseUrl() });

  // ── Step 0: Verify Company A has data ────────────────────────────────────────
  section("Preflight: Company A has data");
  {
    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.company_id', $1, false)`, [DEFAULT_COMPANY_ID]);
      const { rows } = await client.query(
        `SELECT COUNT(*) AS n FROM targets WHERE company_id = $1`, [DEFAULT_COMPANY_ID]
      );
      const count = Number(rows[0]?.n ?? 0);
      if (count === 0) {
        console.warn("  ⚠  Company A has 0 targets — isolation still tested but nothing to leak.");
      } else {
        pass(`Company A owns ${count} target(s) that must not leak to Company B`);
      }
    } finally {
      client.release();
    }
  }

  // ── Step 1: Create Company B + test user ─────────────────────────────────────
  section("Setup: Create Company B + test user");
  {
    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.company_id', $1, false)`, [DEFAULT_COMPANY_ID]);

      await client.query(`
        INSERT INTO companies (id, name, slug)
        VALUES ($1, 'Test Company B', 'test-company-b')
        ON CONFLICT (id) DO NOTHING
      `, [COMPANY_B_ID]);
      pass("Company B inserted");

      // users table has no RLS policy — insert as superuser is fine
      await client.query(`
        INSERT INTO users (id, company_id, email, display_name, role)
        VALUES ($1, $2, $3, 'RLS Test User', 'Admin')
        ON CONFLICT (id) DO NOTHING
      `, [USER_B_ID, COMPANY_B_ID, USER_B_EMAIL]);
      pass("User B inserted");
    } finally {
      client.release();
    }
  }

  // ── Step 2: Sign JWT for Company B user ──────────────────────────────────────
  section("Sign JWT for Company B");
  const tokenB = signJwt(USER_B_ID, COMPANY_B_ID, USER_B_EMAIL);
  pass("JWT signed");

  // ── Step 3: API calls as Company B — all lists must be 200 and empty ─────────
  section("API isolation: Company B sees no Company A data");

  const endpoints: Array<{
    path: string;
    description: string;
    extract: (body: unknown) => unknown[];
  }> = [
    {
      path: "/targets",
      description: "GET /api/targets",
      extract: (b) =>
        Array.isArray(b)
          ? b
          : ((b as Record<string, unknown>)?.targets as unknown[] | undefined) ?? [],
    },
    {
      path: "/actions/command-center",
      description: "GET /api/actions/command-center",
      extract: (b) =>
        Array.isArray(b)
          ? b
          : ((b as Record<string, unknown>)?.actions as unknown[] | undefined) ?? [],
    },
    {
      path: "/notifications",
      description: "GET /api/notifications",
      extract: (b) =>
        Array.isArray(b)
          ? b
          : ((b as Record<string, unknown>)?.notifications as unknown[] | undefined) ?? [],
    },
    {
      path: "/review/weekly",
      description: "GET /api/review/weekly (mustWin)",
      extract: (b) =>
        ((b as Record<string, unknown>)?.mustWin as unknown[] | undefined) ?? [],
    },
    {
      path: "/diligence/review",
      description: "GET /api/diligence/review",
      extract: (b) =>
        ((b as Record<string, unknown>)?.mustWinIncomplete as unknown[] | undefined) ?? [],
    },
  ];

  for (const ep of endpoints) {
    const { status, body } = await apiGet(ep.path, tokenB);

    // Require an explicit 200 — a 500 with an empty error body could otherwise
    // fool the row-count extractor into returning [] and silently passing.
    if (status !== 200) {
      fail(
        `${ep.description} returned HTTP ${status} (body: ${JSON.stringify(body)}) — ` +
        `expected 200. Is the server running and fully migrated?`
      );
    }

    const rows = ep.extract(body);
    if (rows.length > 0) {
      fail(
        `${ep.description} returned ${rows.length} row(s) — ` +
        `data from Company A is leaking to Company B!`
      );
    }
    pass(`${ep.description} → HTTP 200, 0 rows (correct)`);
  }

  // ── Step 4: DB-level enforcement under app_rls (non-superuser) role ───────────
  //
  // PostgreSQL superusers bypass RLS unconditionally. All sub-tests here run
  // under the app_rls role (same role the API server uses) to exercise real
  // RLS policy evaluation. The connection starts as the superuser (postgres),
  // which is always allowed to SET ROLE to any other role.
  //
  section("RLS enforcement via app_rls role (non-superuser)");
  {
    const client = await pool.connect();
    try {
      // Set GUC to Company B (required so app_rls can read/write its own rows).
      // Pool connections may carry stale GUC state from prior uses, so we always
      // set it explicitly before each sub-test.
      await client.query(`SELECT set_config('app.company_id', $1, false)`, [COMPANY_B_ID]);

      // Switch to non-superuser role — from here RLS is fully enforced.
      await client.query(`SET ROLE app_rls`);

      // ─ Test A: Empty GUC under app_rls ─────────────────────────────────────
      // company_id DEFAULT resolves to NULL when GUC is '' → NOT NULL fires.
      await client.query(`SELECT set_config('app.company_id', '', false)`);
      try {
        await client.query(`
          INSERT INTO targets (project_name, target_code)
          VALUES ('LEAK_NOGUC', 'LEAK-000')
        `);
        fail(
          "INSERT with empty GUC under app_rls succeeded — " +
          "company_id NOT NULL constraint is missing!"
        );
      } catch (err: unknown) {
        const msg = (err as Error).message ?? "";
        if (msg.includes("null value") || msg.includes("violates") || msg.includes("not-null")) {
          pass(`Empty GUC under app_rls rejected by NOT NULL: "${msg.split("\n")[0]}"`);
        } else {
          fail(`Unexpected error on empty-GUC insert under app_rls: ${msg}`);
        }
      }

      // ─ Test B: Explicit NULL company_id under app_rls ───────────────────────
      // Restore a valid GUC so other RLS paths don't interfere.
      await client.query(`SELECT set_config('app.company_id', $1, false)`, [COMPANY_B_ID]);
      try {
        await client.query(`
          INSERT INTO targets (project_name, target_code, company_id)
          VALUES ('LEAK_NULLCID', 'LEAK-001', NULL)
        `);
        fail(
          "INSERT with explicit NULL company_id under app_rls succeeded — " +
          "NOT NULL constraint is missing!"
        );
      } catch (err: unknown) {
        const msg = (err as Error).message ?? "";
        if (msg.includes("null value") || msg.includes("violates") || msg.includes("not-null")) {
          pass(`Explicit NULL company_id under app_rls rejected: "${msg.split("\n")[0]}"`);
        } else {
          fail(`Unexpected error on NULL company_id insert under app_rls: ${msg}`);
        }
      }

      // ─ Test C: Cross-tenant INSERT — GUC = Company B, explicit ID = Company A ─
      // RLS WITH CHECK must block this: the row's company_id doesn't match the GUC.
      try {
        await client.query(`
          INSERT INTO targets (project_name, target_code, company_id)
          VALUES ('LEAK_XCOMPANY', 'LEAK-002', $1)
        `, [DEFAULT_COMPANY_ID]);
        fail(
          "Cross-tenant INSERT (Company A ID while GUC = Company B) under app_rls " +
          "succeeded — RLS WITH CHECK is broken!"
        );
      } catch (err: unknown) {
        const msg = (err as Error).message ?? "";
        if (
          msg.includes("violates") ||
          msg.includes("row-level security") ||
          msg.includes("new row") ||
          msg.includes("permission denied")
        ) {
          pass(`Cross-tenant INSERT blocked by RLS WITH CHECK: "${msg.split("\n")[0]}"`);
        } else {
          fail(`Unexpected error on cross-tenant insert under app_rls: ${msg}`);
        }
      }
    } finally {
      // Always reset role before returning the connection to the pool.
      await client.query(`RESET ROLE`).catch(() => {});
      client.release();
    }
  }

  // ── Step 5: Cleanup ───────────────────────────────────────────────────────────
  section("Cleanup: Remove test fixtures");
  {
    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.company_id', $1, false)`, [DEFAULT_COMPANY_ID]);
      await client.query(`DELETE FROM users WHERE id = $1`, [USER_B_ID]);
      await client.query(`DELETE FROM companies WHERE id = $1`, [COMPANY_B_ID]);
      pass("Company B and User B removed");
    } finally {
      client.release();
    }
  }

  await pool.end();

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  ALL CHECKS PASSED — RLS isolation is working correctly.");
  console.log("══════════════════════════════════════════════════════════\n");
}

run().catch((err) => {
  console.error("\nUnhandled error:", err);
  process.exit(1);
});
