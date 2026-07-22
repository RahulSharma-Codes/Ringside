import { spawn } from "child_process";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { Storage } from "@google-cloud/storage";
import pino from "pino";

const logger = pino({ name: "backup-worker" });

const SIDECAR = "http://127.0.0.1:1106";
const BACKUP_PREFIX = "backups/db/";
const RETENTION = 14;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

function getBucketId(): string {
  const id = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!id) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  return id;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function makeStorage(): Storage {
  return new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${SIDECAR}/token`,
      type: "external_account",
      credential_source: {
        url: `${SIDECAR}/credential`,
        format: { type: "json", subject_token_field_name: "access_token" },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  } as ConstructorParameters<typeof Storage>[0]);
}

function buildKey(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = now.getUTCFullYear();
  const mm = pad(now.getUTCMonth() + 1);
  const dd = pad(now.getUTCDate());
  const hh = pad(now.getUTCHours());
  return `${BACKUP_PREFIX}${yyyy}-${mm}-${dd}T${hh}.sql.gz`;
}

async function runBackup(): Promise<void> {
  const bucketId = getBucketId();
  const key = buildKey();
  const gcs = makeStorage();

  logger.info({ key }, "backup: starting");
  const t0 = Date.now();

  const pgHost = requireEnv("PGHOST");
  const pgUser = requireEnv("PGUSER");
  const pgPassword = requireEnv("PGPASSWORD");
  const pgDatabase = requireEnv("PGDATABASE");
  const pgPort = process.env.PGPORT ?? "5432";

  const dump = spawn(
    "pg_dump",
    ["-h", pgHost, "-p", pgPort, "-U", pgUser, "-d", pgDatabase, "--no-password"],
    { env: { ...process.env, PGPASSWORD: pgPassword } },
  );

  let stderrBuf = "";
  dump.stderr.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });

  const dumpExited = new Promise<void>((resolve, reject) => {
    dump.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}: ${stderrBuf.trim()}`));
    });
    dump.on("error", reject);
  });

  const bucket = gcs.bucket(bucketId);
  const file = bucket.file(key);
  const gzip = createGzip({ level: 6 });
  const gcsStream = file.createWriteStream({ resumable: false, contentType: "application/gzip" });

  try {
    await pipeline(dump.stdout, gzip, gcsStream);
    await dumpExited;
  } catch (err) {
    try {
      await file.delete();
    } catch {
    }
    throw err;
  }

  const [meta] = await file.getMetadata();
  const sizeBytes = Number((meta as { size?: string | number }).size ?? 0);
  const elapsedMs = Date.now() - t0;
  logger.info({ key, sizeBytes, elapsedMs }, "backup: upload complete");

  await pruneOldBackups(gcs, bucketId);
}

async function pruneOldBackups(gcs: Storage, bucketId: string): Promise<void> {
  const bucket = gcs.bucket(bucketId);
  const [files] = await bucket.getFiles({ prefix: BACKUP_PREFIX });

  const sorted = files.sort((a, b) => b.name.localeCompare(a.name));
  const toDelete = sorted.slice(RETENTION);

  if (toDelete.length === 0) {
    logger.info({ total: sorted.length }, "backup: retention OK");
    return;
  }

  await Promise.all(toDelete.map((f) => f.delete()));
  logger.info(
    { deleted: toDelete.length, retained: sorted.length - toDelete.length },
    "backup: pruned old dumps",
  );
}

async function tick(): Promise<void> {
  try {
    await runBackup();
  } catch (err) {
    logger.error({ err }, "backup: failed — will retry at next interval");
  }
}

logger.info({ intervalMs: INTERVAL_MS, retentionCount: RETENTION }, "backup-worker started");
void tick();
setInterval(() => void tick(), INTERVAL_MS);
