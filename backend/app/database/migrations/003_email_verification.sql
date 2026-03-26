-- Migration 003: Email verification + color_corrections feature
-- Adds OTP code for email verification at registration
-- Also adds color_corrections to usage feature constraint

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code VARCHAR(6);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires_at TIMESTAMPTZ;

-- Backfill: mark all existing users as verified (they registered before this feature)
UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE;

-- Add color_corrections to usage feature constraint
ALTER TABLE usage DROP CONSTRAINT IF EXISTS ck_usage_feature;
ALTER TABLE usage ADD CONSTRAINT ck_usage_feature
    CHECK (feature IN ('transcription', 'correction', 'derushing', 'normalization', 'color_corrections'));
