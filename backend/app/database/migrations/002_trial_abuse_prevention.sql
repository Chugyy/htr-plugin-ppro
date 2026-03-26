-- Migration 002: Trial abuse prevention
-- Adds had_trial flag and normalized_email for anti-abuse

ALTER TABLE users ADD COLUMN IF NOT EXISTS had_trial BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS normalized_email VARCHAR(255);

-- Backfill normalized_email from existing emails
UPDATE users SET normalized_email = LOWER(TRIM(email)) WHERE normalized_email IS NULL;

-- Add unique constraint on normalized_email
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_normalized_email ON users(normalized_email);
