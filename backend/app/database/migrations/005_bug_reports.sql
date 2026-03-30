-- Migration 005: Bug reports from the plugin
-- Stores automatic error reports sent by the frontend on every error.

CREATE TABLE IF NOT EXISTS bug_reports (
    id             BIGSERIAL    PRIMARY KEY,
    user_id        UUID         REFERENCES users(id) ON DELETE SET NULL,
    feature        VARCHAR(50)  NOT NULL,
    error_message  TEXT         NOT NULL,
    error_stack    TEXT,
    frontend_logs  TEXT,
    project_state  JSONB,
    system_info    JSONB,
    request_ids    TEXT[],
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_created
    ON bug_reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bug_reports_user
    ON bug_reports(user_id);
