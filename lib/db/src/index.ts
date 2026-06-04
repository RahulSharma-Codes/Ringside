import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function getDatabaseUrl(): string {
  // Prefer Replit's managed Postgres (PGHOST is set when it is provisioned).
  // This avoids relying on external Supabase pooler URLs that may be unreachable.
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    const port = PGPORT ?? "5432";
    return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${port}/${PGDATABASE}`;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set, or PGHOST/PGUSER/PGPASSWORD/PGDATABASE for Replit Postgres.",
    );
  }
  return url;
}

export const pool = new Pool({ connectionString: getDatabaseUrl() });
export const db = drizzle(pool, { schema });

export * from "./schema";
