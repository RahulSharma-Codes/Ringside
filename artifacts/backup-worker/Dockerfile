# Backup worker — needs pg_dump (postgresql-client) and runs via tsx.
# GCS uploads use Replit's token sidecar in production; see the note in
# docs/configuration.md for how to configure credentials outside Replit.
FROM node:24-alpine
RUN apk add --no-cache postgresql-client

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /workspace

# Manifests — cached separately from source.
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

# Install everything — tsx (a devDep) is needed to run TypeScript directly.
RUN pnpm install --frozen-lockfile

# Backup worker source
COPY artifacts/backup-worker/ artifacts/backup-worker/

RUN addgroup -S app && adduser -S app -G app
USER app

ENV NODE_ENV=production
WORKDIR /workspace/artifacts/backup-worker

CMD ["pnpm", "run", "start"]
