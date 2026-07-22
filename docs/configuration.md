# Ringside — Configuration Reference

All environment variables read by the API server and backup worker are documented here.
Set them in **Replit Secrets** for production deployments, or in a local `.env.local` file
for development (copy `.env.example` as a starting point — never commit `.env` files).

---

## API Server (`artifacts/api-server`)

### Required — always

| Variable | Description | Where to get it |
|---|---|---|
| `PORT` | TCP port the server listens on. | Set automatically by Replit workflows. Set to any free port (e.g. `3001`) locally. |
| `SESSION_SECRET` | HMAC secret used to sign JWTs. **Must be ≥ 32 characters of random data.** If missing or too short in production the server refuses to boot. | Generate with `openssl rand -hex 32`. Store in Replit Secrets. |
| `PGHOST` | Postgres hostname. | Auto-set by Replit Postgres. Use `localhost` for Docker Compose. |
| `PGUSER` | Postgres username. | Auto-set by Replit Postgres. |
| `PGPASSWORD` | Postgres password. | Auto-set by Replit Postgres. |
| `PGDATABASE` | Postgres database name. | Auto-set by Replit Postgres. |

### Required on first deploy only

| Variable | Description | Behaviour if unset |
|---|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` | Email address for the initial admin account created when the `users` table is empty. | No admin account is seeded — the app starts but no one can log in. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Password for the bootstrap admin account. Must be strong (≥ 12 chars). | Same as above. |

> **Security:** Unset `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` after the first successful boot. The seed logic only runs when the `users` table is empty, but removing these variables from Secrets is defence-in-depth.

### Optional — enable features

| Variable | Default | Description | Consequence if unset |
|---|---|---|---|
| `NODE_ENV` | `development` | Set to `production` on Replit Autoscale. Controls CORS fail-open behaviour and logging format. | CORS allows all origins; structured logging in pretty-print mode. |
| `REPLIT_DOMAINS` | — | Comma-separated list of allowed CORS origins (e.g. `your-app.replit.app`). | In production without this var, CORS is restricted to `localhost` only — the deployed frontend cannot reach the API. |
| `PGPORT` | `5432` | Postgres port. | Defaults to `5432`. |
| `OPENAI_API_KEY` | — | API key for the AI Copilot endpoints (`/api/ai/*`). | All AI endpoints return `setupRequired: true` and are otherwise inert. **Leave unset until the OpenAI DPA is signed** (Human gate H3). |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model used for all AI Copilot calls. | Falls back to `gpt-4o`. |
| `SENTRY_DSN` | — | Sentry Data Source Name for error capture. | Sentry is disabled — the server starts normally. Get the DSN from **sentry.io → Project Settings → Client Keys**. |
| `SMTP_HOST` | — | SMTP server hostname (e.g. `smtp.sendgrid.net`). | OTP login emails cannot be sent. `/api/auth/smtp/status` returns `available: false`. Password login still works. |
| `SMTP_PORT` | `587` | SMTP port. | Defaults to `587` (STARTTLS). |
| `SMTP_USER` | — | SMTP username / sender address. | Required if `SMTP_HOST` is set. |
| `SMTP_PASS` | — | SMTP password or API key. | Required if `SMTP_HOST` is set. |
| `SMTP_FROM` | — | Display name + address for outbound email (e.g. `Ringside <noreply@example.com>`). | Required if `SMTP_HOST` is set. |

### Test / CI only

| Variable | Description |
|---|---|
| `TEST_EMAIL` | Email used by the Playwright E2E suite to log in. Falls back to the dev seed value when unset. |
| `TEST_PASSWORD` | Password used by the Playwright E2E suite. Falls back to the dev seed value when unset. |

---

## Backup Worker (`artifacts/backup-worker`)

The backup worker runs as a separate process and writes nightly `pg_dump` snapshots to
Replit Object Storage. It inherits the same Postgres and Sentry configuration as the
API server.

| Variable | Required | Description | Consequence if unset |
|---|---|---|---|
| `PGHOST` | ✅ | Postgres hostname. | Worker crashes at startup. |
| `PGUSER` | ✅ | Postgres username. | Worker crashes at startup. |
| `PGPASSWORD` | ✅ | Postgres password. | Worker crashes at startup. |
| `PGDATABASE` | ✅ | Postgres database name. | Worker crashes at startup. |
| `PGPORT` | — | Postgres port. Defaults to `5432`. | Uses default. |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | ✅ | Replit Object Storage bucket ID where backups are written. Visible in the Replit `.replit` file. | Worker crashes at startup. |
| `SENTRY_DSN` | — | Sentry DSN. Same var as the API server. | Backup failures are logged but not captured in Sentry. |

> The backup worker runs every **6 hours** and retains the **14 most recent** snapshots.
> Backups are stored under `backups/db/` in the configured Object Storage bucket as
> gzip-compressed SQL dumps (`.sql.gz`).

---

## Branch protection (GitHub — manual, Rahul)

After the GitHub Actions CI workflows are merged (Task #305), enable the following
branch protection rules on `main` via **GitHub → Settings → Branches**:

- **Require status checks to pass before merging:** `verify`, `codeql`, `gitleaks`
- **Require branches to be up to date before merging**
- **Require at least 1 reviewer** (recommended but not enforced)

Without branch protection, CI is advisory — developers can merge with failing checks.

---

## Production-deploy checklist (quick reference)

1. `SESSION_SECRET` — set in Replit Secrets (≥ 32 random chars)
2. `NODE_ENV=production` — set in Replit Autoscale environment
3. `REPLIT_DOMAINS` — set to the deployed domain(s)
4. `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` — set for first boot, then remove
5. `OPENAI_API_KEY` — leave **unset** until Human gate H3 (OpenAI DPA) is signed
6. `SENTRY_DSN` — set and confirm test events arrive in your Sentry project
7. SMTP vars — set if OTP login is required; leave unset to use password-only login
