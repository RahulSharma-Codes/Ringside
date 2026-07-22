import * as Sentry from "@sentry/node";
import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { setMigrationsComplete } from "./routes/health";

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
      setMigrationsComplete();
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
        logger.error(
          { err },
          "Migration failed after all retries — exiting to prevent serving on stale schema",
        );
        Sentry.captureException(err);
        await Sentry.flush(2000);
        process.exit(1);
      }
    }
  }
}

const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

async function applyMigrations(): Promise<void> {
  // Set GUC so RLS-enabled tables remain accessible during migration runs
  await db.execute(sql`SELECT set_config('app.company_id', ${DEFAULT_COMPANY_ID}, false)`);

  // ── CRIT: Create foundational tables BEFORE any that reference them via FK ──
  // These must precede the action_items rename and the actions CREATE TABLE
  // because actions.target_id → targets(id), interactions.target_id → targets(id),
  // and stage_change_log.target_id → targets(id).

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS targets (
      id                              serial PRIMARY KEY,
      target_code                     text NOT NULL UNIQUE,
      project_name                    text NOT NULL,
      legal_name                      text,
      business_unit                   text,
      sector                          text,
      subsector                       text,
      geography_region                text,
      country                         text,
      sourcing_channel                text,
      sourcing_firm                   text,
      deal_owner                      text,
      deal_champion                   text,
      executive_sponsor               text,
      priority_tier                   text NOT NULL DEFAULT 'Watchlist',
      strategic_rationale             text,
      strategic_fit_score             integer,
      synergy_score                   integer,
      financial_attractiveness_score  integer,
      process_maturity_score          integer,
      risk_penalty_score              integer,
      deal_type                       text,
      close_reason_code               text,
      phase1_verdict_accuracy         text,
      phase1_verdict_note             text,
      close_miss_theme                text,
      is_active                       boolean NOT NULL DEFAULT true,
      is_confidential                 boolean NOT NULL DEFAULT true,
      kanban_sort_order               integer NOT NULL DEFAULT 0,
      created_at                      timestamp NOT NULL DEFAULT now(),
      updated_at                      timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS interactions (
      id                    serial PRIMARY KEY,
      target_id             integer NOT NULL REFERENCES targets(id),
      interaction_type      text NOT NULL,
      interaction_datetime  timestamp NOT NULL DEFAULT now(),
      participants_internal text,
      participants_external text,
      summary               text NOT NULL,
      sentiment             text,
      promoter_willingness  text,
      valuation_signal      text,
      created_by            text,
      created_at            timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS stage_change_log (
      id              serial PRIMARY KEY,
      target_id       integer NOT NULL REFERENCES targets(id),
      previous_stage  text,
      new_stage       text NOT NULL,
      changed_by      text,
      change_reason   text,
      changed_at      timestamp NOT NULL DEFAULT now()
    )
  `);

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

  // Create ic_proposals table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ic_proposals (
      id                serial PRIMARY KEY,
      target_id         integer NOT NULL REFERENCES targets(id),
      submitted_by      text,
      submitted_at      timestamp NOT NULL DEFAULT now(),
      recommended_terms text,
      key_risks         text,
      memo_note         text,
      voting_deadline   date,
      status            text NOT NULL DEFAULT 'Voting Open',
      outcome           text,
      outcome_at        timestamp
    )
  `);

  // Create ic_votes table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ic_votes (
      id           serial PRIMARY KEY,
      proposal_id  integer NOT NULL REFERENCES ic_proposals(id) ON DELETE CASCADE,
      voter_name   text NOT NULL,
      vote         text,
      rationale    text,
      conditions   jsonb,
      cast_at      timestamp
    )
  `);

  // Create ic_cps table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ic_cps (
      id           serial PRIMARY KEY,
      proposal_id  integer NOT NULL REFERENCES ic_proposals(id) ON DELETE CASCADE,
      description  text NOT NULL,
      owner_name   text,
      target_date  date,
      closed_at    timestamp,
      status       text NOT NULL DEFAULT 'Open'
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

  // Create notifications table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id          serial PRIMARY KEY,
      target_id   integer REFERENCES targets(id),
      type        text NOT NULL,
      title       text NOT NULL,
      body        text NOT NULL,
      link_path   text,
      is_read     boolean NOT NULL DEFAULT false,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read)`);
  // Add classification column to deal_documents (Task #76)
  await db.execute(sql`ALTER TABLE deal_documents ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'Restricted'`);
  // Create audit_events table (append-only — no UPDATE/DELETE routes exposed)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_events (
      id               serial PRIMARY KEY,
      event_type       text NOT NULL,
      target_id        integer,
      user_identifier  text,
      occurred_at      timestamptz NOT NULL DEFAULT now(),
      payload          jsonb,
      hash_prev        text,
      hash_self        text
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_events_target_id_idx ON audit_events(target_id, occurred_at DESC)`);

  // Multi-tenancy: companies + users + OTP + session blocklist tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS companies (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name        text NOT NULL,
      slug        text NOT NULL,
      config      jsonb,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    INSERT INTO companies (id, name, slug)
    SELECT '00000000-0000-0000-0000-000000000001', 'CDS', 'cds'
    WHERE NOT EXISTS (SELECT 1 FROM companies LIMIT 1)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    uuid NOT NULL,
      email         text NOT NULL,
      display_name  text,
      role          text NOT NULL DEFAULT 'Member',
      password_hash text,
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email)`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_password_attempts integer NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_locked_until timestamptz`);
  // ── Admin bootstrap seed ──────────────────────────────────────────────────
  // Runs only when:
  //   (a) NODE_ENV !== "production"  — dev / staging convenience seed, OR
  //   (b) BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD are both set AND
  //       the users table is empty  — production first-run bootstrap
  //
  // This is intentionally idempotent: a second run when the table already has
  // rows is a no-op regardless of env vars.
  const userCountResult = await db.execute(sql`SELECT COUNT(*) AS count FROM users`);
  const isEmpty = parseInt(String((userCountResult.rows[0] as { count: string }).count), 10) === 0;

  const bootstrapEmail    = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  const shouldSeed =
    (process.env.NODE_ENV !== "production") ||
    (bootstrapEmail && bootstrapPassword && isEmpty);

  if (shouldSeed && isEmpty) {
    const seedEmail    = bootstrapEmail    ?? "admin@ringside.local";
    const seedPassword = bootstrapPassword ?? "ChangeMe@Dev1";
    const seedHash     = await bcrypt.hash(seedPassword, 10);
    // Upsert by email — idempotent if the row already exists (e.g. concurrent starts)
    await db.execute(sql`
      INSERT INTO users (company_id, email, display_name, role, password_hash)
      VALUES ('00000000-0000-0000-0000-000000000001', ${seedEmail}, 'Admin', 'Admin', ${seedHash})
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `);
    logger.info({ email: seedEmail }, "Admin seed account created");
  } else if (isEmpty) {
    // Production with no bootstrap env vars and no users — warn operator
    logger.warn(
      "No users exist and BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD are not set. " +
      "Set these env vars on first deploy to create the initial admin account."
    );
  }
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS otp_attempts (
      id            serial PRIMARY KEY,
      email         text NOT NULL,
      code_hash     text NOT NULL,
      expires_at    timestamptz NOT NULL,
      attempts      integer NOT NULL DEFAULT 0,
      locked_until  timestamptz,
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS session_blocklist (
      id          serial PRIMARY KEY,
      jti         text NOT NULL UNIQUE,
      expires_at  timestamptz NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS ic_proposals_target_id_idx ON ic_proposals(target_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ic_votes_proposal_id_idx ON ic_votes(proposal_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ic_cps_proposal_id_idx ON ic_cps(proposal_id)`);

  // Verdict / doctrine columns (Task 74)
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS close_reason_code text`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS phase1_verdict_accuracy text`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS phase1_verdict_note text`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS close_miss_theme text`);

  // Deal metadata columns added by later features
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS deal_type text`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS risk_penalty_score integer`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT true`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS financial_attractiveness_score integer`);
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS process_maturity_score integer`);

  // kanban_sort_order — within-stage drag ordering
  await db.execute(sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS kanban_sort_order integer NOT NULL DEFAULT 0`);

  // Advisor conflict resolution notes (Task 101)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS advisor_conflict_notes (
      id            serial PRIMARY KEY,
      advisor_id    integer NOT NULL REFERENCES deal_advisors(id) ON DELETE CASCADE,
      note          text NOT NULL,
      author        text NOT NULL,
      status_at_time text NOT NULL,
      created_at    timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS advisor_conflict_notes_advisor_id_idx ON advisor_conflict_notes(advisor_id, created_at DESC)`);

  // Invite tokens — email-based teammate invitations
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS invite_tokens (
      id           serial PRIMARY KEY,
      company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      email        text NOT NULL,
      role         text NOT NULL DEFAULT 'Member',
      display_name text,
      token_hash   text NOT NULL UNIQUE,
      expires_at   timestamptz NOT NULL,
      used_at      timestamptz,
      created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at   timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS invite_tokens_token_hash_idx ON invite_tokens(token_hash)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS invite_tokens_email_idx ON invite_tokens(email)`);

  // Per-user deal visibility — explicit target <-> user grants (Task 201)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS target_access (
      id          serial PRIMARY KEY,
      target_id   integer NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      granted_by  uuid REFERENCES users(id) ON DELETE SET NULL,
      granted_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS target_access_target_user_idx ON target_access(target_id, user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS target_access_user_id_idx ON target_access(user_id)`);

  // ── Multi-tenancy: company_id on all core tables + RLS ───────────────────────

  const CORE_TABLES = [
    "targets", "actions", "interactions", "milestones", "deal_documents",
    "ic_sessions", "ic_proposals", "ic_votes", "ic_cps",
    "valuations", "deal_economics", "synergies",
    "nda_records", "regulatory_clearances", "deal_advisors", "advisor_conflict_notes",
    "deal_sponsors", "invite_tokens",
    "stage_change_log", "ai_phase_runs",
    "audit_events", "notifications", "target_access",
  ] as const;

  // Step 1: add company_id column (idempotent)
  for (const table of CORE_TABLES) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS company_id uuid`));
  }

  // Step 2: backfill NULL rows to default company (before RLS enforcement)
  for (const table of CORE_TABLES) {
    await db.execute(sql.raw(
      `UPDATE ${table} SET company_id = '${DEFAULT_COMPANY_ID}' WHERE company_id IS NULL`
    ));
  }

  // Step 3: enforce schema constraints on company_id now that all rows are filled
  for (const table of CORE_TABLES) {
    // 3a: NOT NULL — safe after backfill; idempotent in Postgres
    await db.execute(sql.raw(`ALTER TABLE ${table} ALTER COLUMN company_id SET NOT NULL`));

    // 3b: GUC-based DEFAULT so inserts without an explicit company_id are automatically
    //     scoped to the current tenant — makes existing INSERT routes RLS-compliant.
    await db.execute(sql.raw(
      `ALTER TABLE ${table} ALTER COLUMN company_id ` +
      `SET DEFAULT (nullif(current_setting('app.company_id', true), '')::uuid)`
    ));

    // 3c: FK to companies — add idempotently via DO block
    const fkName = `${table}_company_id_fkey`;
    await db.execute(sql.raw(`
      DO $fk$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.table_constraints
          WHERE constraint_name = '${fkName}' AND table_name = '${table}'
        ) THEN
          ALTER TABLE ${table}
            ADD CONSTRAINT ${fkName} FOREIGN KEY (company_id)
            REFERENCES companies(id) ON DELETE CASCADE;
        END IF;
      END $fk$
    `));
  }

  // Step 4: enable RLS (idempotent) and add isolation policy per table
  for (const table of CORE_TABLES) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    await db.execute(sql.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
    await db.execute(sql.raw(`
      DO $rls$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM pg_policies
          WHERE tablename = '${table}' AND policyname = 'company_isolation'
        ) THEN
          CREATE POLICY company_isolation ON ${table}
            USING (company_id = nullif(current_setting('app.company_id', true), '')::uuid)
            WITH CHECK (company_id = nullif(current_setting('app.company_id', true), '')::uuid);
        END IF;
      END $rls$
    `));
  }

  // ── app_rls: non-superuser role for RLS enforcement ───────────────────────
  // PostgreSQL superusers bypass RLS unconditionally — even FORCE ROW LEVEL
  // SECURITY has no effect on them. To make the company_isolation policies
  // actually filter rows, every request-scoped DB connection switches to the
  // app_rls role (a non-superuser) via SET ROLE in acquireRequestContext, then
  // resets back to superuser before the connection is returned to the pool.
  //
  // This migration (re-)runs every startup so any table added since the last
  // run automatically gets permissions granted to app_rls.
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rls') THEN
        CREATE ROLE app_rls NOLOGIN;
      END IF;
    END $$
  `);
  // Grant DML on all tables that exist right now (idempotent).
  await db.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls`);
  // Grant sequence access so serial PKs work under app_rls.
  await db.execute(sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rls`);
  // Revoke destructive operations on audit_events from app_rls too — the route
  // layer never exposes UPDATE/DELETE, but belt-and-suspenders at the DB level.
  await db.execute(sql`REVOKE UPDATE, DELETE ON audit_events FROM app_rls`);

  // ── audit_events: DB-level write-once enforcement ──────────────────────────
  // The application never exposes UPDATE or DELETE routes for audit_events, but
  // enforcing this at the DB-role level ensures that even a compromised API
  // process cannot alter or erase audit rows — a hard tamper-evidence guarantee.
  // REVOKE is idempotent: re-revoking a privilege that was never granted is a
  // no-op (Postgres silently ignores it).
  await db.execute(sql`REVOKE UPDATE, DELETE ON audit_events FROM CURRENT_USER`);

  // ── Score nullable migration ───────────────────────────────────────────────
  // Drops NOT NULL + DEFAULT on all five score columns so newly created targets
  // carry NULL (unassessed) rather than misleading default values (50 or 0).
  // DROP NOT NULL and SET DEFAULT NULL are idempotent in Postgres.
  await db.execute(sql`
    ALTER TABLE targets
      ALTER COLUMN strategic_fit_score         DROP NOT NULL,
      ALTER COLUMN strategic_fit_score         SET DEFAULT NULL,
      ALTER COLUMN synergy_score               DROP NOT NULL,
      ALTER COLUMN synergy_score               SET DEFAULT NULL,
      ALTER COLUMN financial_attractiveness_score DROP NOT NULL,
      ALTER COLUMN financial_attractiveness_score SET DEFAULT NULL,
      ALTER COLUMN process_maturity_score      DROP NOT NULL,
      ALTER COLUMN process_maturity_score      SET DEFAULT NULL,
      ALTER COLUMN risk_penalty_score          DROP NOT NULL,
      ALTER COLUMN risk_penalty_score          SET DEFAULT NULL
  `);
}

function checkSmtpConfig(): void {
  const vars = { SMTP_HOST: process.env.SMTP_HOST, SMTP_USER: process.env.SMTP_USER, SMTP_PASS: process.env.SMTP_PASS };
  const setCount = Object.values(vars).filter(Boolean).length;
  if (setCount > 0 && setCount < 3) {
    const missing = Object.entries(vars)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    logger.warn(
      { missing },
      `SMTP is partially configured — missing ${missing.join(", ")}. OTP emails will not be sent and the OTP endpoint will return an error instead of falling back to dev mode.`,
    );
  }
}

checkSmtpConfig();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

runMigrationsWithRetry().catch((err) => {
  logger.error({ err }, "runMigrations unhandled rejection — exiting");
  process.exit(1);
});
