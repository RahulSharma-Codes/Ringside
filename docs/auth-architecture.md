# Auth Architecture Proposal: Supabase Auth + Role-Based Access

**Status:** Proposal — not yet implemented  
**Date:** 2025-05-04  
**Author:** Engineering

---

## Overview

Ringside currently uses a single shared `APP_PASSWORD` environment variable for access control. This is workable for a single-team pilot but cannot scale to multiple users, role-based permissions, or audit-trail requirements.

This document proposes migrating to **Supabase Auth** (email/password) with JWT verification in Express, backed by a `user_profiles` table that maps Supabase auth users to application roles.

---

## Recommended Architecture

### 1. Identity Provider: Supabase Auth (email/password)

- Users sign in with email + password via the Supabase Auth client library (`@supabase/supabase-js`) in the frontend.
- Supabase issues a signed JWT (RS256) for each authenticated session, containing `sub` (the user's UUID in `auth.users`) and standard claims.
- The frontend stores the JWT and attaches it to every API request as a Bearer token.

### 2. JWT Verification in Express Middleware

The `requireAuth` middleware is updated to:

1. Extract the Bearer token from the `Authorization` header.
2. Verify the JWT signature using Supabase's public JWKS endpoint:  
   `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`
3. Decode and validate claims (`iss`, `exp`, `aud`).
4. Look up the corresponding `user_profiles` row using the `sub` claim as `auth_user_id`.
5. Attach the profile (including `role`) to `req.user` for downstream route handlers.

```typescript
// Conceptual updated requireAuth middleware
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL(`https://${process.env.SUPABASE_PROJECT_REF}.supabase.co/auth/v1/.well-known/jwks.json`)
);

export async function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (req.path === "/healthz" || req.path.startsWith("/auth/") || req.path.startsWith("/launch/")) return next();

  // Transition period: also accept APP_PASSWORD via Bearer or x-app-password header
  const appPassword = process.env.APP_PASSWORD;
  const bearer = extractBearerToken(req.get("authorization"));
  const headerPwd = req.get("x-app-password");
  if (appPassword && (bearer === appPassword || headerPwd === appPassword)) {
    req.user = { role: "Admin", isActive: true }; // treat shared password as admin
    return next();
  }

  if (!bearer) return res.status(401).json({ error: "Authentication required." });

  try {
    const { payload } = await jwtVerify(bearer, JWKS, {
      issuer: `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co/auth/v1`,
      audience: "authenticated",
    });
    const profile = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.authUserId, payload.sub))
      .limit(1);
    if (!profile[0] || !profile[0].isActive) {
      return res.status(403).json({ error: "User account is inactive or not found." });
    }
    req.user = profile[0];
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}
```

### 3. Frontend Auth Flow

1. Replace the `LoginScreen` password form with a Supabase email/password form using `@supabase/supabase-js`.
2. On successful login, store the Supabase session (JWT) and refresh token.
3. Pass the JWT as `Authorization: Bearer <token>` on all API requests via `setAuthTokenGetter`.
4. Handle token refresh automatically using Supabase's `onAuthStateChange`.

---

## `user_profiles` Table Design

See `docs/proposed-migrations/user-profiles.sql` for the exact CREATE statements.

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` primary key | Internal record ID |
| `auth_user_id` | `uuid` unique not null | References `auth.users(id)` in Supabase |
| `email` | `text` unique not null | Denormalised from Supabase auth for convenience |
| `full_name` | `text` | Display name |
| `role` | `user_role` enum | `Admin`, `Deal Lead`, `Contributor`, `Executive Viewer` |
| `is_active` | `boolean` | Soft-disable without deleting |
| `created_at` | `timestamptz` | Auto-set |
| `updated_at` | `timestamptz` | Auto-updated via trigger |

---

## Role Permission Matrix

| Permission | Admin | Deal Lead | Contributor | Executive Viewer |
|---|:---:|:---:|:---:|:---:|
| Manage users (create/deactivate) | ✅ | ❌ | ❌ | ❌ |
| Edit deal records (targets, milestones) | ✅ | ✅ | ❌ | ❌ |
| Bulk import (CSV/Excel) | ✅ | ✅ | ❌ | ❌ |
| Change pipeline stages | ✅ | ✅ | ❌ | ❌ |
| Upload deal documents | ✅ | ✅ | ✅ | ❌ |
| Log interactions | ✅ | ✅ | ✅ | ❌ |
| Create / update assigned actions | ✅ | ✅ | ✅ | ❌ |
| Read-only access (pipeline, actions, docs) | ✅ | ✅ | ✅ | ✅ |

**Implementation note:** Role checks should be enforced at the Express route level (middleware or per-route guard), not exclusively in the frontend. The frontend can hide UI elements by role, but the API must be the authoritative enforcement point.

---

## Migration Path

### Phase 0 — Current State (APP_PASSWORD)
Single shared password in `APP_PASSWORD` env var. All authenticated users have full access.

### Phase 1 — Add Supabase Auth (parallel with APP_PASSWORD)
1. Create Supabase project; enable email/password auth.
2. Apply the `user_profiles` migration to the production database.
3. Create initial user accounts in Supabase Auth and populate `user_profiles`.
4. Deploy updated `requireAuth` middleware that accepts **either** the APP_PASSWORD (for backward compatibility / CLI tools) **or** a valid Supabase JWT.
5. Deploy updated frontend with Supabase login form; existing users can still use the old password form via a fallback.

### Phase 2 — Add Role Enforcement
1. Add per-route guards using `req.user.role` on write operations (PUT, POST, DELETE).
2. Communicate role constraints to the team.
3. Monitor for 403 errors; adjust roles as needed.

### Phase 3 — Remove APP_PASSWORD
1. Once all users are on Supabase Auth and no scripts depend on `APP_PASSWORD`:
   - Remove the APP_PASSWORD fallback from `requireAuth`.
   - Remove the `APP_PASSWORD` secret.
2. Archive or delete the old `LoginScreen` component.

---

## Risks and Open Questions

| # | Risk / Question | Mitigation |
|---|---|---|
| 1 | **JWT key rotation** — Supabase rotates signing keys periodically. JWKS caching must handle key roll-overs gracefully. | Use `jose`'s `createRemoteJWKSet` which fetches and caches the JWKS automatically, re-fetching on unknown `kid`. |
| 2 | **Session expiry UX** — Supabase access tokens expire after 1 hour. Users mid-session could hit 401 errors. | Implement `onAuthStateChange` + silent token refresh in the frontend. Show a "session expired" toast with re-login prompt on 401. |
| 3 | **Email verification** — Should new user accounts require email verification before they can log in? | Recommended: yes, for security. Admins should create accounts; employees self-verify. |
| 4 | **MFA** — Is TOTP or SMS MFA required given the sensitivity of deal data? | Supabase supports TOTP MFA. Recommended for Admin role at minimum. Requires a future implementation task. |
| 5 | **Supabase dependency** — Adds a third-party auth dependency. | Supabase is open-source; self-hosting is possible. JWT verification is standard and can be adapted to other providers if needed. |
| 6 | **Row-Level Security (RLS)** — Should `user_profiles` be accessible only to the service role? | Yes. The `user_profiles` table should have RLS enabled. The Express service connects via the Supabase **service role key** (server-side only), bypassing RLS. |
| 7 | **APP_PASSWORD transition** — During Phase 1, both auth mechanisms are active, increasing attack surface temporarily. | Set a migration deadline. Monitor auth logs for unexpected APP_PASSWORD usage after Supabase Auth is live. |
| 8 | **Invited-only vs self-signup** | For a corporate dev tool, disable public self-signup in Supabase; admins create accounts manually or via invite link. |

---

## Next Steps (for Engineering Review)

1. Review and approve this architecture proposal.
2. Apply `user-profiles.sql` to a staging environment.
3. Implement Phase 1 (Supabase project setup, updated middleware, updated login form).
4. Conduct internal testing before rollout to the full team.
