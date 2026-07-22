# ── Build stage ──────────────────────────────────────────────────────────────
# Full workspace is needed so pnpm can resolve all packages. esbuild bundles
# most dependencies inline; only a handful (pdfkit, exceljs, nodemailer,
# @google-cloud/*, @opentelemetry/*) remain as externals that need node_modules.
FROM node:24-alpine AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Pin pnpm to the same version used in Replit (10.26.1). Without an explicit
# pin, corepack downloads the latest pnpm (11.x), which treats ERR_PNPM_IGNORED_BUILDS
# as a fatal error and breaks `pnpm install --frozen-lockfile` in the build stage.
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /workspace

# Copy manifests first — this layer is cached until pnpm-lock.yaml changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json \
     tsconfig.json tsconfig.base.json ./

COPY lib/db/package.json              lib/db/
COPY lib/api-zod/package.json         lib/api-zod/
COPY lib/api-spec/package.json        lib/api-spec/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY artifacts/api-server/package.json      artifacts/api-server/
COPY artifacts/backup-worker/package.json   artifacts/backup-worker/
COPY artifacts/growth-os/package.json       artifacts/growth-os/
COPY artifacts/mockup-sandbox/package.json  artifacts/mockup-sandbox/
COPY scripts/package.json   scripts/
COPY tests/package.json     tests/

RUN pnpm install --frozen-lockfile

# Copy lib source (bundled inline by esbuild; no separate build step needed).
COPY lib/ lib/
# Copy api-server source only (growth-os and others are not needed at runtime).
COPY artifacts/api-server/ artifacts/api-server/

# Compile: esbuild → dist/index.mjs
RUN pnpm --filter @workspace/api-server run build

# Extract a standalone deployment directory with production node_modules only.
# Workspace packages (@workspace/db, @workspace/api-zod) are already bundled
# into dist/index.mjs by esbuild, so pnpm deploy is used purely for the
# external npm packages (pdfkit, exceljs, nodemailer, @google-cloud/*, etc.).
RUN pnpm deploy --filter @workspace/api-server --prod /deploy


# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

# Production node_modules (external deps only — everything else is in the bundle)
COPY --from=builder /deploy/node_modules ./node_modules
# Compiled bundle + source maps
COPY --from=builder /workspace/artifacts/api-server/dist ./dist

USER app
ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/healthz || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
