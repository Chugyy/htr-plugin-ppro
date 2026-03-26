-- Migration 004: Plugin version storage
-- Store .ccx plugin binaries in DB instead of static files

CREATE TABLE IF NOT EXISTS plugin_versions (
    id         SERIAL       PRIMARY KEY,
    version    VARCHAR(20)  NOT NULL,
    filename   VARCHAR(100) NOT NULL,
    file_data  BYTEA        NOT NULL,
    file_size  INTEGER      NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plugin_versions_uploaded
    ON plugin_versions(uploaded_at DESC);
