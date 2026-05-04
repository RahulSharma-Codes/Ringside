-- Proposed Migration: Make score columns nullable
-- Purpose: Allow early-stage targets to have genuinely unset scores
--          rather than carrying misleading default values (50 or 0).
-- DO NOT run this automatically — apply manually after reviewing impact.

ALTER TABLE targets ALTER COLUMN strategic_fit_score DROP NOT NULL;
ALTER TABLE targets ALTER COLUMN strategic_fit_score SET DEFAULT NULL;

ALTER TABLE targets ALTER COLUMN synergy_score DROP NOT NULL;
ALTER TABLE targets ALTER COLUMN synergy_score SET DEFAULT NULL;

ALTER TABLE targets ALTER COLUMN financial_attractiveness_score DROP NOT NULL;
ALTER TABLE targets ALTER COLUMN financial_attractiveness_score SET DEFAULT NULL;

ALTER TABLE targets ALTER COLUMN process_maturity_score DROP NOT NULL;
ALTER TABLE targets ALTER COLUMN process_maturity_score SET DEFAULT NULL;

ALTER TABLE targets ALTER COLUMN risk_penalty_score DROP NOT NULL;
ALTER TABLE targets ALTER COLUMN risk_penalty_score SET DEFAULT NULL;
