# Ringside — Database Backup & Restore Runbook

## Overview

Ringside runs an automated backup worker that dumps the PostgreSQL database every **6 hours**, compresses each dump with gzip, and uploads it to **Replit Object Storage**. The 14 most recent dumps are retained automatically; older ones are deleted after each successful run.

**Recovery Point Objective (RPO):** ≤ 6 hours (aligned with backup cadence).

---

## Encryption

Replit Object Storage is built on Google Cloud Storage (GCS). GCS encrypts all data at rest using **AES-256** by default, at no additional configuration or cost. This applies to every object written by the backup worker. No client-side encryption layer is required or applied — the GCS server-side encryption covers the full backup lifecycle.

Reference: [Google Cloud Storage — Data encryption at rest](https://cloud.google.com/storage/docs/encryption)

---

## Backup Storage Layout

All backups are stored under the prefix:

```
backups/db/YYYY-MM-DDTHH.sql.gz
```

Examples:
```
backups/db/2026-07-21T18.sql.gz   ← dump taken at 18:00 UTC on 21 Jul 2026
backups/db/2026-07-21T12.sql.gz
backups/db/2026-07-21T06.sql.gz
```

Keys are ISO-8601 UTC timestamps, so they sort lexicographically (newest last in ascending order, newest first in descending order).

---

## Listing Available Backups

### Via the Admin API (quickest)

```bash
curl -s -H "Authorization: Bearer <ADMIN_JWT>" \
  https://<your-domain>/api/admin/backup/status | jq
```

Response:
```json
{
  "lastBackup": {
    "key": "backups/db/2026-07-21T18.sql.gz",
    "sizeBytes": 4194304,
    "createdAt": "2026-07-21T18:03:42.000Z"
  },
  "totalBackups": 14
}
```

### Via the Replit Object Storage sidecar (from within the Replit environment)

```bash
curl -s http://127.0.0.1:1106/list-objects \
  -H "Content-Type: application/json" \
  -d '{"bucket_name":"<DEFAULT_OBJECT_STORAGE_BUCKET_ID>","prefix":"backups/db/"}' \
  | jq
```

---

## Downloading a Backup

Use the Replit Object Storage sidecar's signed-URL endpoint to download a specific dump. Run this from within the Replit environment (e.g., Shell tab):

```bash
# 1. Generate a signed download URL (valid for 1 hour)
BUCKET_ID="$DEFAULT_OBJECT_STORAGE_BUCKET_ID"
OBJECT_KEY="backups/db/2026-07-21T18.sql.gz"   # ← change to target dump
EXPIRES_AT=$(date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ")

curl -s http://127.0.0.1:1106/object-storage/signed-object-url \
  -H "Content-Type: application/json" \
  -d "{
    \"bucket_name\": \"$BUCKET_ID\",
    \"object_name\": \"$OBJECT_KEY\",
    \"method\": \"GET\",
    \"expires_at\": \"$EXPIRES_AT\"
  }" | jq -r '.signed_url'

# 2. Download the dump using the signed URL printed above
curl -L -o dump.sql.gz "<SIGNED_URL>"
```

---

## Restoring from a Backup

> **Warning:** Restoring overwrites the current database. Perform this only during a maintenance window and ensure all application servers are stopped first.

### Prerequisites

- `psql` (PostgreSQL client) — already in PATH on the Replit host (`which psql`)
- `gunzip` — part of standard Linux tools
- Target database access (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` env vars)

### Full Restore Procedure

```bash
# Step 1 — Stop application workflows (API server, backup worker)
# Do this via the Replit workflow controls before proceeding.

# Step 2 — Download the chosen backup (see above)
curl -L -o dump.sql.gz "<SIGNED_URL>"

# Step 3 — Verify the download (should print stats, not an error)
gunzip -t dump.sql.gz && echo "Integrity OK"

# Step 4 — Drop and recreate the database
# (skip if restoring to an empty DB)
PGPASSWORD="$PGPASSWORD" psql \
  -h "$PGHOST" -p "${PGPORT:-5432}" -U "$PGUSER" \
  -d postgres \
  -c "DROP DATABASE IF EXISTS $PGDATABASE; CREATE DATABASE $PGDATABASE;"

# Step 5 — Restore
gunzip -c dump.sql.gz | PGPASSWORD="$PGPASSWORD" psql \
  -h "$PGHOST" -p "${PGPORT:-5432}" -U "$PGUSER" -d "$PGDATABASE"

# Step 6 — Verify row counts for key tables
PGPASSWORD="$PGPASSWORD" psql \
  -h "$PGHOST" -p "${PGPORT:-5432}" -U "$PGUSER" -d "$PGDATABASE" \
  -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;"

# Step 7 — Restart application workflows
```

### Estimated Timing

| Database size | Dump download | Restore time |
|---|---|---|
| < 100 MB | < 30 s | 1–3 min |
| 100 MB – 1 GB | 1–5 min | 5–20 min |
| > 1 GB | 5–30 min | 20–60 min |

---

## Verifying Backup Health

The backup worker logs each run to stdout. Check via the Replit workflow console (`artifacts/backup-worker: Backup Worker`). Key log fields:

| Field | Meaning |
|---|---|
| `"backup: starting"` | Dump initiated |
| `"backup: upload complete"` | Successful upload; `bytes` = compressed size |
| `"backup: pruned old dumps"` | Retention enforced |
| `"backup: failed"` | Error; worker will retry at next 6-hour interval |

---

## Restore Drill Recommendation

Although automated restore drills are out of scope for this release, it is strongly recommended to:

1. Perform a manual restore drill **quarterly** to a separate test database.
2. Verify key table row counts match the source after restore.
3. Document the drill timestamp and outcome in your incident log.

---

## Disaster Recovery Contacts

| Role | Person |
|---|---|
| Corporate Development Tech Lead | [DRI from Manipal Group] |
| Replit Support | https://replit.com/support |
