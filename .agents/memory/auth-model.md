---
name: Auth model
description: How login works in this app — password default, OTP backup, no shared secret
---

Per-user email + password is the default login (`POST /api/auth/login`). Email OTP
(`/api/auth/otp/request` + `/otp/verify`) is the backup path, used when a user hasn't
set a password yet or has forgotten it. There is no shared/global password anymore —
the old `APP_PASSWORD` env var and its middleware fallback were removed.

**Why:** the shared password was a backdoor — anyone with the one password had full
access with no per-user identity or audit trail. Task-driven removal in favor of
per-account credentials with lockout.

**How it fits together:**
- New installs get a passwordless `admin@ringside.local` seeded automatically. First
  login must go through OTP (SMTP not configured in dev returns the code directly in
  the response for convenience).
- Both `/login` and `/otp/verify` return `needsPasswordSetup: true` when the user has
  no `passwordHash` yet; the frontend then shows a "set a password" screen that calls
  `POST /api/auth/set-password` (requires a valid bearer JWT). Users can skip this and
  keep using OTP — never locked out.
- Password login has its own lockout (5 failed attempts → 15 min), tracked via
  `failedPasswordAttempts` / `passwordLockedUntil` on the `users` table — separate from
  the OTP attempt's own lockout counters.
- `requireAuth` (formerly `requireAppPassword`) in `middlewares/auth.ts` is JWT-only:
  no bearer token or invalid/expired token means 401. No fallback branch exists.
