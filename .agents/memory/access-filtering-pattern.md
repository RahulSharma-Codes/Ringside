---
name: Per-user visibility filtering pattern
description: How to add row-level "which records can this user see" filtering across multiple list/aggregate endpoints without breaking empty-array SQL.
---

When adding a per-user visibility/grant system (e.g. "admin assigns which deals each user can see") on top of an existing multi-endpoint API:

- Centralize the scope resolution in one helper (`getAccessScope(req)` returning `{ isAdmin, userId, accessibleIds }`) rather than re-querying grants in every route.
- Every endpoint that lists, aggregates, or joins against the restricted entity must apply the same scope — not just the primary "list" endpoint. Dashboard/review/summary endpoints that independently join the same table are easy to miss and silently leak rows.
- `inArray(col, ids)` with an empty `ids` array produces invalid/always-false SQL in some ORMs — always short-circuit to an empty/zeroed response *before* querying when a non-admin has zero grants, rather than passing an empty array into the query.
- Admin/bypass roles should skip the filter entirely rather than being granted every row explicitly — cheaper and avoids drift when new records are created.

**Why:** the visibility restriction was requested at the "which deals can a person see" level, but the codebase had 3+ independently-querying review/analytics endpoints beyond the main list route; missing even one meant non-admins could still see restricted data through a side door.

**How to apply:** when adding a new restricted-visibility feature, grep for every route that queries the restricted table directly (not just via the "canonical" list endpoint) and wire the same scope check into each.
