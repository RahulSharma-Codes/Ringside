-- Add deal_type column to targets table
-- Run this against the database after deploying the schema change.
-- The column is nullable so existing rows are unaffected.

ALTER TABLE targets
  ADD COLUMN IF NOT EXISTS deal_type text;
