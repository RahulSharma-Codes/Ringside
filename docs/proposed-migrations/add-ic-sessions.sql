-- Migration: add ic_sessions table
-- Stores Investment Committee session records per deal target.

CREATE TABLE IF NOT EXISTS ic_sessions (
  id          serial PRIMARY KEY,
  target_id   integer NOT NULL REFERENCES targets(id),
  session_date date NOT NULL,
  attendees   text,
  outcome     text NOT NULL,   -- Approved | Conditional | Rejected | Deferred
  conditions  text,
  notes       text,
  created_at  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ic_sessions_target_id_idx ON ic_sessions(target_id);
