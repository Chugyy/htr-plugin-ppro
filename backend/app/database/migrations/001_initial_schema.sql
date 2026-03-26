-- Migration 001: Initial Schema
-- Based on docs/architecture/backend/schema.md
-- Date: 2026-03-24
-- Tables: users, password_reset_tokens, api_keys, usage,
--         stripe_events, teams, team_members, team_invites
-- Creation order respects FK dependencies

-- ---------------------------------------------------------------------------
-- 1. users (root entity — no FK dependencies)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email                       VARCHAR(255) NOT NULL,
    password_hash               TEXT         NOT NULL,
    name                        VARCHAR(255) NOT NULL,
    stripe_customer_id          VARCHAR(255) UNIQUE,
    stripe_subscription_id      VARCHAR(255) UNIQUE,
    stripe_subscription_item_id VARCHAR(255),
    plan                        VARCHAR(50)  NOT NULL DEFAULT 'free'
                                    CONSTRAINT ck_users_plan
                                    CHECK (plan IN ('free', 'starter', 'pro', 'agency')),
    subscription_status         VARCHAR(50)  NOT NULL DEFAULT 'active'
                                    CONSTRAINT ck_users_subscription_status
                                    CHECK (subscription_status IN ('none', 'trialing', 'active', 'past_due', 'cancelled', 'banned')),
    current_period_end          TIMESTAMPTZ,
    cancel_at_period_end        BOOLEAN      NOT NULL DEFAULT FALSE,
    payment_failed_at           TIMESTAMPTZ,
    seat_count                  INTEGER      NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_subscription_id
    ON users(stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. password_reset_tokens (FK → users)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    UUID        NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_password_reset_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_password_reset_tokens_token_hash
        UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
    ON password_reset_tokens(token_hash);

-- ---------------------------------------------------------------------------
-- 3. api_keys (FK → users)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_keys (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      UUID         NOT NULL,
    name         VARCHAR(100) NOT NULL,
    key          VARCHAR(60)  NOT NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_api_keys_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_api_keys_key
        UNIQUE (key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key
    ON api_keys(key);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id
    ON api_keys(user_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_active
    ON api_keys(user_id)
    WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- 4. stripe_events (standalone — no FK)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stripe_events (
    event_id   TEXT        PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No additional indexes — PK on event_id covers the only lookup pattern

-- ---------------------------------------------------------------------------
-- 5. usage (FK → users, api_keys)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    UUID        NOT NULL,
    api_key_id BIGINT      NOT NULL,
    feature    VARCHAR(30) NOT NULL
                   CONSTRAINT ck_usage_feature
                   CHECK (feature IN ('transcription', 'correction', 'derushing', 'normalization')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_usage_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_usage_api_key
        FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_user_feature_created
    ON usage(user_id, feature, created_at);

CREATE INDEX IF NOT EXISTS idx_usage_api_key_id
    ON usage(api_key_id);

-- ---------------------------------------------------------------------------
-- 6. teams (FK → users ON DELETE RESTRICT)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS teams (
    id         BIGSERIAL   PRIMARY KEY,
    owner_id   UUID        NOT NULL,
    seat_count INTEGER     NOT NULL DEFAULT 1
                   CONSTRAINT ck_teams_seat_count
                   CHECK (seat_count >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_teams_owner
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_teams_owner_id
    ON teams(owner_id);

-- ---------------------------------------------------------------------------
-- 7. team_members (FK → teams, users)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_members (
    id        BIGSERIAL   PRIMARY KEY,
    team_id   BIGINT      NOT NULL,
    user_id   UUID        NOT NULL,
    role      VARCHAR(10) NOT NULL
                  CONSTRAINT ck_team_members_role
                  CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_team_members_team
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    CONSTRAINT fk_team_members_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_team_members_team_user
        UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id
    ON team_members(team_id);

CREATE INDEX IF NOT EXISTS idx_team_members_user_id
    ON team_members(user_id);

-- ---------------------------------------------------------------------------
-- 8. team_invites (FK → teams)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_invites (
    id         BIGSERIAL    PRIMARY KEY,
    team_id    BIGINT       NOT NULL,
    email      VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64)  NOT NULL,
    expires_at TIMESTAMPTZ  NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_team_invites_team
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    CONSTRAINT uq_team_invites_token_hash
        UNIQUE (token_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_token_hash
    ON team_invites(token_hash);

CREATE INDEX IF NOT EXISTS idx_team_invites_team_email
    ON team_invites(team_id, email)
    WHERE used_at IS NULL;
