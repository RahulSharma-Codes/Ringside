---
name: OTEL/Sentry pnpm override conflict
description: How to safely force @opentelemetry/core@2.x for CVE while keeping sdk-trace-base@1.x working
---

## The problem

Forcing `@opentelemetry/core: ">=2.8.0"` globally (for GHSA-8988-4f7v-96qf) crashes the api-server
at startup. Root cause: `sdk-trace-base@1.30.1` imports `TracesSamplerValues` from `@opentelemetry/core`
(NOT from `@opentelemetry/api` — a common wrong assumption). That export was **removed in core@2.x**.

Sentry v9 (as of 9.47.1) still uses `sdk-trace-base@^1.30.1`, NOT 2.x. The comment in the workspace
yaml saying "Sentry v9 uses sdk-trace-base@2.x" was factually wrong.

## The fix (dual override)

```yaml
# in pnpm-workspace.yaml overrides section:
"@opentelemetry/core": ">=2.8.0"                            # global: fixes GHSA-8988-4f7v-96qf
"@opentelemetry/sdk-trace-base>@opentelemetry/core": "^1.30.1"  # sdk-trace-base@1.x needs core@1.x
```

Path-specific overrides take precedence over the global one. This gives:
- Sentry's direct core dep → 2.x (CVE fixed)
- sdk-trace-base's isolated core dep → 1.x (TracesSamplerValues present → server starts)

## Audit impact

`pnpm audit --prod` will still flag `sdk-trace-base>@opentelemetry/core@1.x` as moderate (GHSA-8988-4f7v-96qf).
This is **acceptable**: CI uses `--audit-level high`, so this moderate finding does NOT fail CI.

## Other fixes in same session

- `brace-expansion` override capped to `">=2.1.2 <3"` — prevents resolution to v5.x which lacks the
  `default` ESM export that `minimatch@9.x` (from Sentry v9 chain) expects.
- `backup-worker` dev script: `node --import tsx src/index.ts` (ESM mode avoids CJS circular-dep crash)
- `@sentry/node` catalog upgraded from `^8` to `^9`
- `@opentelemetry/api` added as direct dep of api-server (externalized in esbuild, must be resolvable at runtime)

**Why:** pnpm global override + OTEL 2.x breaking change + Sentry still on sdk-trace-base@1.x = diamond dep conflict.
