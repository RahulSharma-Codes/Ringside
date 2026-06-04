import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runMigrationsWithRetry(): Promise<void> {
  const delays = [5_000, 15_000, 30_000, 60_000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      await applyMigrations();
      logger.info("Startup migrations complete");
      return;
    } catch (err) {
      if (attempt < delays.length) {
        const delay = delays[attempt]!;
        logger.warn(
          { attempt: attempt + 1, retryInMs: delay },
          "Migration attempt failed, will retry",
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.warn(
          { err },
          "Migration failed after all retries — schema may need manual intervention",
        );
      }
    }
  }
}

async function applyMigrations(): Promise<void> {
  // Rename action_items → actions (idempotent)
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'action_items')
         AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'actions') THEN
        ALTER TABLE action_items RENAME TO actions;
      END IF;
    END $$;
  `);

  // Create actions table if still missing
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS actions (
      id           serial PRIMARY KEY,
      target_id    integer NOT NULL REFERENCES targets(id),
      interaction_id integer,
      description  text NOT NULL,
      owner        text,
      due_date     date,
      priority     text NOT NULL DEFAULT 'Medium',
      status       text NOT NULL DEFAULT 'Open',
      created_at   timestamp NOT NULL DEFAULT now(),
      completed_at timestamp,
      workstream   text,
      notes        text,
      evidence_links jsonb
    )
  `);

  // Add missing columns to actions (idempotent via DO block)
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='actions' AND column_name='workstream') THEN
        ALTER TABLE actions ADD COLUMN workstream text;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='actions' AND column_name='notes') THEN
        ALTER TABLE actions ADD COLUMN notes text;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='actions' AND column_name='evidence_links') THEN
        ALTER TABLE actions ADD COLUMN evidence_links jsonb;
      END IF;
    END $$;
  `);

  // Create deal_documents table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS deal_documents (
      id             serial PRIMARY KEY,
      target_id      integer NOT NULL REFERENCES targets(id),
      title          text NOT NULL,
      document_type  text NOT NULL DEFAULT 'Other',
      status         text NOT NULL DEFAULT 'Requested',
      owner          text,
      document_date  date,
      url            text,
      workstream     text,
      notes          text,
      storage_path   text,
      file_name      text,
      file_size      bigint,
      mime_type      text,
      uploaded_at    timestamptz,
      created_at     timestamp NOT NULL DEFAULT now(),
      updated_at     timestamp NOT NULL DEFAULT now()
    )
  `);

  // Create milestones table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS milestones (
      id                      serial PRIMARY KEY,
      target_id               integer NOT NULL REFERENCES targets(id),
      current_stage           text NOT NULL DEFAULT 'Sourcing',
      stage_entered_at        timestamp NOT NULL DEFAULT now(),
      nda_status              text NOT NULL DEFAULT 'Not Sent',
      nda_date                date,
      cim_received_date       date,
      data_room_access        text NOT NULL DEFAULT 'No',
      data_room_access_date   date,
      commercial_dd_status    text NOT NULL DEFAULT 'Not Started',
      financial_dd_status     text NOT NULL DEFAULT 'Not Started',
      legal_dd_status         text NOT NULL DEFAULT 'Not Started',
      tax_dd_status           text NOT NULL DEFAULT 'Not Started',
      tech_dd_status          text NOT NULL DEFAULT 'Not Started',
      non_binding_offer_date  date,
      binding_offer_date      date,
      signing_date            date,
      closing_date            date,
      drop_reason_category    text,
      drop_reason_detail      text,
      updated_at              timestamp NOT NULL DEFAULT now()
    )
  `);

  // Create ic_sessions table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ic_sessions (
      id           serial PRIMARY KEY,
      target_id    integer NOT NULL REFERENCES targets(id),
      session_date date NOT NULL,
      attendees    text,
      outcome      text NOT NULL,
      conditions   text,
      notes        text,
      created_at   timestamp NOT NULL DEFAULT now()
    )
  `);

  // Indexes
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ic_sessions_target_id_idx ON ic_sessions(target_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS deal_documents_target_id_idx ON deal_documents(target_id)`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

runMigrationsWithRetry().catch((err) =>
  logger.warn({ err }, "runMigrations unhandled error"),
);
