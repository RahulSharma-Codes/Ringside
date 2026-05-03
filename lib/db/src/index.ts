import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL must be set in Replit Secrets. Use the Supabase pooler URL.",
    );
  }

  // Important: always prefer the explicit Replit Secret DATABASE_URL.
  // Replit projects can also expose PGHOST/PGDATABASE for local Postgres;
  // those must not override the Supabase pooler connection.
  return url;
}

export const pool = new Pool({ connectionString: getDatabaseUrl() });
export const db = drizzle(pool, { schema });

export * from "./schema";
