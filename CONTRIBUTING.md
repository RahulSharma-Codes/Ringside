# Contributing to Ringside

Ringside is an internal Manipal Group tool maintained by the Corporate Development
& Strategy technology team. These guidelines apply to all engineers with access to
this repository.

## Prerequisites

- Node.js 24 (managed via `.nvmrc` / Nix)
- pnpm (workspace-level — see `pnpm-workspace.yaml`)
- PostgreSQL 16 (Replit managed, available via `PGHOST`)
- Access to the internal Replit workspace

## Getting Started

```bash
pnpm install          # install all workspace dependencies
pnpm run typecheck    # full TypeScript check across all packages
# Schema changes: edit lib/db/src/schema/*.ts, then boot the API server — its
# idempotent startup migrations (artifacts/api-server/src/index.ts) apply them.
# (drizzle-kit push was removed: it conflicts with the startup DDL and mangles
# the company_id/RLS state. Do not reintroduce it.)
```

Start services via the Replit workflow runner (Run button) or individually:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/growth-os run dev
```

## Branching

| Branch | Purpose |
|---|---|
| `main` | Production-ready; protected — no direct pushes |
| `task/<id>-short-description` | Feature or bug-fix branch per task |
| `hotfix/<id>-description` | Emergency patch for production incidents |

Branch from `main`. Name branches with the task ID from the project board
(e.g. `task/283-dependency-hygiene`).

## Making Changes

1. **Create a branch** from `main`.
2. **Make your changes** following the patterns already in the codebase:
   - API-first: add/update the OpenAPI spec in `lib/api-spec/openapi.yaml` before
     writing route handlers.
   - Run codegen after spec changes: `pnpm --filter @workspace/api-spec run codegen`
   - Keep backend routes in `artifacts/api-server/src/routes/`.
   - Keep frontend pages in `artifacts/growth-os/src/pages/`.
   - Use `drizzle-orm` for all DB access; avoid raw SQL outside startup migrations.
3. **Run checks** before opening a PR:
   ```bash
   pnpm run typecheck
   pnpm audit --prod   # zero critical/high CVEs required
   ```
4. **Write or update tests** in the `tests/` workspace package for any new
   user-facing flow. Run with `pnpm --filter @workspace/tests run test`.

## Pull Requests

- Target branch: `main`
- Title format: `[TaskID] Short imperative summary` (e.g. `[283] Fix CVEs + cleanup`)
- Description must include:
  - What changed and why
  - Any migration steps required (DB schema changes, env var additions)
  - How to verify the change manually
- Assign at least one reviewer from the core team before merging.
- Squash-merge is preferred to keep `main` history clean.

## Code Review

Reviewers should check:
- TypeScript: no `any` types introduced without a comment explaining why
- Security: no new secrets or credentials in source; use environment variables
- Database: schema changes use `IF NOT EXISTS` / `IF NOT EXISTS` guards
- API contracts: breaking changes require a version bump and migration plan
- Performance: no N+1 queries introduced without pagination or batching

## Commit Style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): short description

Longer body if needed.
```

Common scopes: `api`, `ui`, `db`, `auth`, `diligence`, `import`, `notifications`.

## Environment Variables

Never commit secrets. Add new environment variables to:
1. The Replit Secrets panel (for development)
2. The deployment environment via the Replit deployment config
3. A comment in `docs/` or this file describing the variable's purpose

## Database Migrations

Schema changes are applied via idempotent startup migrations in
`artifacts/api-server/src/index.ts`. Each migration block must:
- Use `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Be tested against an empty database and an existing database

Do **not** use `drizzle-kit push` in production — all schema changes go through
the startup migration path.

## Questions

Reach the team on the internal Slack: `#corp-dev-tech`
