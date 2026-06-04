import { defineConfig } from "drizzle-kit";
import path from "path";

function getDatabaseUrl(): string {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    const port = PGPORT ?? "5432";
    return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${port}/${PGDATABASE}`;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE must be set");
  }
  return url;
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
