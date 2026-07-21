#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Schema changes are applied by the API server's idempotent startup migrations.
# Do NOT run drizzle-kit push here — it would apply destructive DDL to the
# production database without review and cannot be rolled back.
