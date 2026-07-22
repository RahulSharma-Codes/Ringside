/**
 * Unit tests for target-access.ts — the IDOR enforcement layer.
 *
 * A bug here would expose any deal record to any authenticated user, so
 * these tests must catch incorrect access-scope resolution immediately.
 *
 * The @workspace/db module is mocked so the suite runs without a real
 * database connection. The mock intercepts `db.select()` calls and returns
 * pre-configured rows controlled by `mockState`.
 *
 * drizzle-orm is also mocked to prevent `eq()`/`and()` from throwing when
 * called with the lightweight mock table objects.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";

// ── Shared mutable state (hoisted so the vi.mock factory can close over it) ──

const mockState = vi.hoisted(() => ({
  /**
   * Incremented on each `db.select()` call.
   * Even index (0, 2, …) → user lookup (first call per `getAccessScope` invocation).
   * Odd index  (1, 3, …) → access-rows lookup (second call per invocation).
   */
  selectCallIndex: 0,
  userRows: [] as Array<{ id: string; email: string; role: string }>,
  accessRows: [] as Array<{ targetId: number }>,
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: vi.fn().mockReturnValue("__eq__"),
  and: vi.fn().mockReturnValue("__and__"),
}));

vi.mock("@workspace/db", () => {
  /**
   * Returns a chainable object that is also a Promise resolving to `rows`.
   * Both `.limit(n)` and awaiting the chain directly (via `.then`) work,
   * which covers both query termination patterns used in target-access.ts:
   *   - `.select().from(t).where(c).limit(1)` — terminates with limit()
   *   - `.select({…}).from(t).where(c)`       — terminates with where() (thenable)
   */
  function makeChain(rows: unknown[]) {
    const p = Promise.resolve(rows);
    const chain: Record<string, unknown> = {
      from: (_table: unknown) => chain,
      where: (_cond: unknown) => chain,
      limit: (_n: number) => p,
      then: p.then.bind(p),
      catch: p.catch.bind(p),
      finally: p.finally.bind(p),
    };
    return chain;
  }

  return {
    db: {
      select: vi.fn().mockImplementation((_fields?: unknown) => {
        const idx = mockState.selectCallIndex++;
        const rows = idx % 2 === 0 ? mockState.userRows : mockState.accessRows;
        return makeChain(rows);
      }),
    },
    targetAccessTable: { targetId: "targetId", userId: "userId" },
    usersTable: { email: "email", id: "id", role: "role" },
  };
});

// ── Import subject AFTER mocks are declared ───────────────────────────────────

import { getAccessScope, canAccessTarget } from "./target-access";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockReq(email: string): Request {
  return { jwtClaims: { email } } as unknown as Request;
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockState.selectCallIndex = 0;
  mockState.userRows = [];
  mockState.accessRows = [];
});

// ── getAccessScope ─────────────────────────────────────────────────────────────

describe("getAccessScope", () => {
  it("returns isAdmin=false and empty ids when no JWT claim is present", async () => {
    const req = { jwtClaims: undefined } as unknown as Request;
    const scope = await getAccessScope(req);
    expect(scope).toEqual({ isAdmin: false, userId: null, accessibleTargetIds: [] });
  });

  it("returns isAdmin=false and empty ids when user is not found in DB", async () => {
    mockState.userRows = []; // DB returns no user row
    const scope = await getAccessScope(mockReq("unknown@test.com"));
    expect(scope).toEqual({ isAdmin: false, userId: null, accessibleTargetIds: [] });
  });

  it("returns isAdmin=true for a user with role Admin (no target list needed)", async () => {
    mockState.userRows = [{ id: "u-admin", email: "admin@test.com", role: "Admin" }];
    const scope = await getAccessScope(mockReq("admin@test.com"));
    expect(scope.isAdmin).toBe(true);
    expect(scope.userId).toBe("u-admin");
    // Admins don't get an accessibleTargetIds list — it is not needed
    expect(scope.accessibleTargetIds).toEqual([]);
  });

  it("returns isAdmin=false with correct target ids for a non-admin with grants", async () => {
    mockState.userRows = [{ id: "u-1", email: "analyst@test.com", role: "Analyst" }];
    mockState.accessRows = [{ targetId: 7 }, { targetId: 12 }, { targetId: 42 }];
    const scope = await getAccessScope(mockReq("analyst@test.com"));
    expect(scope.isAdmin).toBe(false);
    expect(scope.userId).toBe("u-1");
    expect(scope.accessibleTargetIds).toEqual([7, 12, 42]);
  });

  it("returns isAdmin=false with empty ids for a non-admin with zero grants", async () => {
    mockState.userRows = [{ id: "u-2", email: "viewer@test.com", role: "Viewer" }];
    mockState.accessRows = []; // no grants
    const scope = await getAccessScope(mockReq("viewer@test.com"));
    expect(scope.isAdmin).toBe(false);
    expect(scope.userId).toBe("u-2");
    expect(scope.accessibleTargetIds).toEqual([]);
  });
});

// ── canAccessTarget ────────────────────────────────────────────────────────────

describe("canAccessTarget", () => {
  it("returns true for an Admin (bypasses target-id list)", async () => {
    mockState.userRows = [{ id: "u-admin", email: "admin@test.com", role: "Admin" }];
    const result = await canAccessTarget(mockReq("admin@test.com"), 999);
    expect(result).toBe(true);
  });

  it("returns false when the user record is not found (unauthenticated call)", async () => {
    mockState.userRows = []; // unknown user
    const result = await canAccessTarget(mockReq("ghost@test.com"), 5);
    expect(result).toBe(false);
  });

  it("returns true for a non-admin who has been granted access to the exact target", async () => {
    mockState.userRows = [{ id: "u-3", email: "analyst@test.com", role: "Analyst" }];
    mockState.accessRows = [{ targetId: 5 }, { targetId: 10 }];
    const result = await canAccessTarget(mockReq("analyst@test.com"), 5);
    expect(result).toBe(true);
  });

  it("returns false for a non-admin who has NOT been granted access to the requested target", async () => {
    mockState.userRows = [{ id: "u-3", email: "analyst@test.com", role: "Analyst" }];
    mockState.accessRows = [{ targetId: 5 }, { targetId: 10 }]; // does not include 99
    const result = await canAccessTarget(mockReq("analyst@test.com"), 99);
    expect(result).toBe(false);
  });

  it("returns false for a non-admin with zero grants", async () => {
    mockState.userRows = [{ id: "u-4", email: "newuser@test.com", role: "Viewer" }];
    mockState.accessRows = [];
    const result = await canAccessTarget(mockReq("newuser@test.com"), 1);
    expect(result).toBe(false);
  });

  it("returns true for a non-admin with multiple grants when target is in the list", async () => {
    mockState.userRows = [{ id: "u-5", email: "multi@test.com", role: "Analyst" }];
    mockState.accessRows = [
      { targetId: 1 }, { targetId: 2 }, { targetId: 3 }, { targetId: 4 },
    ];
    const result = await canAccessTarget(mockReq("multi@test.com"), 3);
    expect(result).toBe(true);
  });
});
