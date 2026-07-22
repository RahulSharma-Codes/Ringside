# Ringside — Configuration Reference

All environment variables read by the API server, backup worker, and shared DB library
are documented here. This file is generated from a static scan of `process.env` references
across `artifacts/api-server/src/`, `artifacts/backup-worker/src/`, and `lib/db/src/`.

Set them in **Replit Secrets** for production deployments, or in a local `.env.local`
file for development (copy `.env.example` as a starting point — never commit `.env` files).

---

## API Server (`artifacts/api-server`)

### Required — always

| Variable | Description | Behaviour when unset |
|---|---|---|
| `PORT` | TCP port the server listens on. | Server refuses to boot — throws `"PORT environment variable is required"`. |
| `SESSION_SECRET` | HMAC secret used to sign JWTs. **Must be ≥ 32 characters of random data.** | Server refuses to boot — auth middleware rejects the short secret. Generate with `openssl rand -hex 32`. |

### Database connection

The DB layer (`lib/db`) prefers the explicit Postgres variables over `DATABASE_URL`.
Both paths are supported; `PG*` variables take precedence when `PGHOST` is set.

| Variable | Required | Description | Behaviour when unset |
|---|---|---|---|
| `PGHOST` | ✅ (preferred) | Postgres hostname. Auto-set by Replit Postgres. | Falls back to `DATABASE_URL` if set; otherwise connection fails at startup. |
| `PGUSER` | ✅ (preferred) | Postgres username. Auto-set by Replit Postgres. | Same fallback as above. |
| `PGPASSWORD` | ✅ (preferred) | Postgres password. Auto-set by Replit Postgres. | Same fallback as above. |
| `PGDATABASE` | ✅ (preferred) | Postgres database name. Auto-set by Replit Postgres. | Same fallback as above. |
| `PGPORT` | — | Postgres port. | Defaults to `5432`. |
| `DATABASE_URL` | Fallback | Full Postgres connection URI (e.g. `postgresql://user:pass@host/db`). Used only when `PGHOST` is **not** set. | If neither `PGHOST` nor `DATABASE_URL` is set, the pool cannot connect and the server will fail startup migrations. |

> **Precedence rule (from `lib/db/src/index.ts`):** When `PGHOST` is present, the pool is
> built from `PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT`. `DATABASE_URL` is only read as
> a fallback when `PGHOST` is absent. On Replit, the platform always sets `PGHOST`, so
> `DATABASE_URL` is effectively unused in hosted environments.

### Required on first deploy only

| Variable | Description | Behaviour when unset |
|---|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` | Email for the initial admin account, created only when the `users` table is empty. | No admin account is seeded — the app starts but no one can log in until an account is created manually. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Password for the bootstrap admin. Must be strong (≥ 12 chars). | Same as above. |

> **Security:** Remove `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from Replit
> Secrets after the first successful boot. The seed logic only runs when `users` is empty,
> but removing these variables is defence-in-depth.

### Optional — runtime behaviour

| Variable | Default | Description | Behaviour when unset |
|---|---|---|---|
| `NODE_ENV` | `development` | Set to `production` on Replit Autoscale. Controls CORS strict-mode, SSL enforcement, and Postgres SSL. | CORS fails-open (allows all origins); Postgres connects without SSL; log output is pretty-printed. |
| `REPLIT_DOMAINS` | — | Comma-separated list of allowed CORS origins (e.g. `your-app.replit.app`). | In production without this var, CORS is restricted to `localhost` only — the deployed frontend cannot call the API. In development (no `NODE_ENV=production`), all origins are allowed. |
| `BASE_PATH` | `""` | Base URL prefix for invite and magic-link emails (e.g. `/api`). Used when constructing absolute URLs in auth emails. | Falls back to empty string; invite links use a relative path which works on Replit but may break in self-hosted setups. |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`). | Defaults to `info`. |

### Optional — features

| Variable | Default | Description | Behaviour when unset |
|---|---|---|---|
| `OPENAI_API_KEY` | — | OpenAI API key for the AI Copilot (`/api/ai/*`). | All AI endpoints return `setupRequired: true`. The rest of the app is unaffected. **Leave unset until the OpenAI DPA is signed.** |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model used for AI Copilot calls. | Falls back to `gpt-4o`. |
| `SENTRY_DSN` | — | Sentry Data Source Name for error capture. | Sentry is disabled — the server starts normally. Get the DSN from **sentry.io → Project Settings → Client Keys**. |
| `SMTP_HOST` | — | SMTP server hostname (e.g. `smtp.sendgrid.net`). | OTP/invite emails cannot be sent. `/api/auth/smtp/status` returns `available: false`. Password login still works. |
| `SMTP_PORT` | `587` | SMTP port. `465` enables implicit TLS. | Defaults to `587` (STARTTLS). |
| `SMTP_USER` | — | SMTP username / sender address. Required if `SMTP_HOST` is set. | Nodemailer auth fails if `SMTP_HOST` is set but `SMTP_USER` is absent. |
| `SMTP_PASS` | — | SMTP password or API key. Required if `SMTP_HOST` is set. | Same as above. |
| `SMTP_FROM` | `SMTP_USER` | Display name + address for outbound email (e.g. `Ringside <noreply@example.com>`). | Falls back to the value of `SMTP_USER`. |
| `OIDC_CLIENT_ID` | — | OAuth 2.0 / OIDC client ID for SSO login. | SSO login routes return `501 Not Implemented`. Password and OTP login are unaffected. |
| `OIDC_ISSUER` | — | OIDC issuer URL (e.g. `https://accounts.google.com`). Required alongside `OIDC_CLIENT_ID`. | Same as above. |

### Test / CI only

| Variable | Description |
|---|---|
| `TEST_EMAIL` | Email used by the Playwright E2E suite to log in. Falls back to the dev-seed value when unset. |
| `TEST_PASSWORD` | Password for the E2E suite. Falls back to the dev-seed value when unset. |

---

## Backup Worker (`artifacts/backup-worker`)

The backup worker runs as a separate process, writes nightly `pg_dump` snapshots to
Replit Object Storage, and retains the 14 most recent backups. It shares the same Postgres
and Sentry variables as the API server.

| Variable | Required | Default | Description | Behaviour when unset |
|---|---|---|---|---|
| `PGHOST` | ✅ | — | Postgres hostname. | Worker crashes at startup (`Missing required env var: PGHOST`). |
| `PGUSER` | ✅ | — | Postgres username. | Worker crashes at startup. |
| `PGPASSWORD` | ✅ | — | Postgres password (passed to `pg_dump` via environment). | Worker crashes at startup. |
| `PGDATABASE` | ✅ | — | Postgres database name. | Worker crashes at startup. |
| `PGPORT` | — | `5432` | Postgres port. | Uses default. |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | ✅ | — | Replit Object Storage bucket ID where `.sql.gz` backups are written. Visible in the Replit `.replit` file. | Worker crashes at startup (`DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set`). |
| `SENTRY_DSN` | — | — | Same Sentry DSN as the API server. | Backup failures are logged locally but not captured in Sentry. |

> Backups run every **6 hours** and are stored under `backups/db/` as
> `YYYY-MM-DDTHH.sql.gz`. Pruning keeps the 14 most recent files.

---

## Branch protection (GitHub — manual step for Rahul)

After the GitHub Actions CI workflows land (Task #305), enable the following on
`main` via **GitHub → Settings → Branches → Branch protection rules**:

- **Require status checks:** `verify`, `codeql`, `gitleaks`
- **Require branches to be up to date before merging**
- **Require at least 1 reviewer** (recommended)

Without branch protection, CI is advisory — PRs can merge with failing checks.

---

## Production deploy checklist (quick reference)

| # | Variable | Action |
|---|---|---|
| 1 | `SESSION_SECRET` | Set in Replit Secrets (≥ 32 random chars via `openssl rand -hex 32`) |
| 2 | `NODE_ENV` | Set to `production` in Replit Autoscale environment |
| 3 | `REPLIT_DOMAINS` | Set to the deployed domain(s), comma-separated |
| 4 | `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` | Set for first boot, then **remove** from Secrets |
| 5 | `OPENAI_API_KEY` | Leave **unset** until OpenAI DPA is signed |
| 6 | `SENTRY_DSN` | Set and confirm test events arrive in your Sentry project |
| 7 | SMTP vars | Set if OTP / invite-link email is required; leave unset for password-only login |
| 8 | `OIDC_CLIENT_ID` + `OIDC_ISSUER` | Set only if SSO login is required |
