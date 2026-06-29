---
name: RLS pool.query intercept
description: How per-request company context is enforced for RLS — Drizzle Proxy approach failed; pool.query override works.
---

# RLS per-request company isolation

## The rule
Override `pool.query` with an AsyncLocalStorage intercept rather than wrapping `db` in a Proxy.

**Why:** Drizzle's `NodePgPreparedQuery` stores `this.client` (the pool object) at construction time and calls `this.client.query(...)` at execution time. A Proxy on the `db` object is intercepted at property-access time (when `.select()` is called), but the actual query runs through the stored session's client — which bypasses the Proxy. Overriding `pool.query` directly is reliable because it intercepts the actual query-execution call.

**How to apply:**
```typescript
// lib/db/src/index.ts
const requestClientStorage = new AsyncLocalStorage<pg.PoolClient>();
const originalQuery = pool.query.bind(pool);
(pool as any).query = (...args: unknown[]) => {
  const client = requestClientStorage.getStore();
  return client ? client.query(...args) : originalQuery(...args);
};
```

In `acquireRequestContext(companyId)`:
1. `pool.connect()` → dedicated PoolClient
2. `client.query("SET app.company_id = '...'")` on that client
3. Return `run(fn) => requestClientStorage.run(client, fn)` for Express middleware

**Limitation:** Transactions (`db.transaction(...)`) call `pool.connect()` internally to get a new client; that new client won't have the GUC set. None of the current routes use explicit transactions, so this is acceptable for now.
