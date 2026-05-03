import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  const pgHost = process.env.PGHOST;
  const pgPort = process.env.PGPORT || "5432";
  const pgUser = process.env.PGUSER || "postgres";
  const pgDatabase = process.env.PGDATABASE;
  const pgPassword = process.env.PGPASSWORD;

  if (pgHost && pgDatabase && (!url || url.includes("supabase.co"))) {
    const auth = pgPassword ? `${pgUser}:${pgPassword}` : pgUser;
    return `postgresql://${auth}@${pgHost}:${pgPort}/${pgDatabase}`;
  }

  if (!url) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  return url;
}

export const pool = new Pool({ connectionString: getDatabaseUrl() });
export const db = drizzle(pool, { schema });

export * from "./schema";
