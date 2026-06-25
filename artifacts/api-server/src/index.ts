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

  // Create valuations table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS valuations (
      id           serial PRIMARY KEY,
      target_id    integer NOT NULL REFERENCES targets(id),
      version      integer NOT NULL DEFAULT 1,
      stage_at_record text,
      methodology  text NOT NULL,
      value_low    text,
      value_point  text,
      value_high   text,
      currency     text NOT NULL DEFAULT 'USD',
      notes        text,
      recorded_by  text,
      recorded_at  timestamp NOT NULL DEFAULT now()
    )
  `);

  // Create deal_economics table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS deal_economics (
      id                serial PRIMARY KEY,
      target_id         integer NOT NULL UNIQUE REFERENCES targets(id),
      cash_pct          text,
      equity_pct        text,
      earnout_pct       text,
      deferred_pct      text,
      escrow_pct        text,
      total_ev          text,
      total_equity_value text,
      irr_base          text,
      irr_upside        text,
      irr_downside      text,
      moic_base         text,
      moic_upside       text,
      moic_downside     text,
      payback_years     text,
      updated_at        timestamp NOT NULL DEFAULT now()
    )
  `);

  // Create synergies table (numeric columns for financial integrity)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS synergies (
      id                      serial PRIMARY KEY,
      target_id               integer NOT NULL REFERENCES targets(id),
      type                    text NOT NULL,
      description             text NOT NULL,
      fy1                     double precision,
      fy2                     double precision,
      fy3                     double precision,
      fy4                     double precision,
      fy5                     double precision,
      one_time_cost           double precision,
      confidence              text NOT NULL DEFAULT 'Possible',
      owner_name              text,
      realisation_start_month text,
      realisation_status      text NOT NULL DEFAULT 'Not Started',
      is_disynergy            boolean NOT NULL DEFAULT false,
      created_at              timestamp NOT NULL DEFAULT now(),
      updated_at              timestamp NOT NULL DEFAULT now()
    )
  `);
  // Idempotent migration: upgrade fy1-5 and one_time_cost from text to double precision
  // if the table was created before the numeric schema was introduced.
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'synergies' AND column_name = 'fy1' AND data_type = 'text'
      ) THEN
        ALTER TABLE synergies
          ALTER COLUMN fy1           TYPE double precision USING fy1::double precision,
          ALTER COLUMN fy2           TYPE double precision USING fy2::double precision,
          ALTER COLUMN fy3           TYPE double precision USING fy3::double precision,
          ALTER COLUMN fy4           TYPE double precision USING fy4::double precision,
          ALTER COLUMN fy5           TYPE double precision USING fy5::double precision,
          ALTER COLUMN one_time_cost TYPE double precision USING one_time_cost::double precision;
      END IF;
    END $$
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_phase_runs (
      id          serial PRIMARY KEY,
      target_id   integer NOT NULL REFERENCES targets(id),
      phase       text NOT NULL,
      prompt_hash text,
      output_json jsonb NOT NULL,
      model       text,
      tokens_used integer,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Indexes
  // Create deal_sponsors table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS deal_sponsors (
      id         serial PRIMARY KEY,
      target_id  integer NOT NULL REFERENCES targets(id),
      name       text NOT NULL,
      role_title text,
      email      text,
      notes      text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Create deal_advisors table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS deal_advisors (
      id               serial PRIMARY KEY,
      target_id        integer NOT NULL REFERENCES targets(id),
      side             text NOT NULL DEFAULT 'buy-side',
      advisor_type     text NOT NULL,
      firm_name        text NOT NULL,
      contact_name     text,
      contact_email    text,
      engagement_date  text,
      fee_structure    text,
      conflicts_status text NOT NULL DEFAULT 'Pending',
      notes            text,
      created_at       timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Add structured counterparty columns to targets
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS cp_cin text`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS cp_founders text`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS cp_key_management text`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS cp_controlling_shareholders text`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS cp_website text`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS cp_notes text`);

  // Indexes
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ic_sessions_target_id_idx ON ic_sessions(target_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS deal_documents_target_id_idx ON deal_documents(target_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS valuations_target_id_idx ON valuations(target_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS synergies_target_id_idx ON synergies(target_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_phase_runs_target_phase_idx ON ai_phase_runs(target_id, phase)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS deal_sponsors_target_id_idx ON deal_sponsors(target_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS deal_advisors_target_id_idx ON deal_advisors(target_id)`);

  // Create nda_records table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS nda_records (
      id            serial PRIMARY KEY,
      target_id     integer NOT NULL REFERENCES targets(id),
      counterparty  text,
      effective_date text,
      expiry_date   text,
      scope         text NOT NULL DEFAULT 'Mutual',
      term_months   integer,
      doc_reference text,
      status        text NOT NULL DEFAULT 'Active',
      notes         text,
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Create regulatory_clearances table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS regulatory_clearances (
      id                    serial PRIMARY KEY,
      target_id             integer NOT NULL REFERENCES targets(id),
      category              text NOT NULL,
      description           text,
      owner_name            text,
      status                text NOT NULL DEFAULT 'Pending',
      target_clearance_date text,
      evidence_reference    text,
      notes                 text,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS nda_records_target_id_idx ON nda_records(target_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS reg_clearances_target_id_idx ON regulatory_clearances(target_id)`);
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
