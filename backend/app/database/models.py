"""
SQLAlchemy-style schema documentation.

NOTE: This file is DOCUMENTATION ONLY.
Actual DB queries use asyncpg pool directly (see db.py).
Do NOT use these classes for queries.

Schema: docs/architecture/backend/schema.md
Tables: users, password_reset_tokens, api_keys, usage,
        stripe_events, teams, team_members, team_invites
"""

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime,
    ForeignKey, CheckConstraint, BigInteger
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


class User(Base):
    __tablename__ = 'users'

    id                          = Column(UUID(as_uuid=True), primary_key=True, server_default='gen_random_uuid()')
    email                       = Column(String(255), nullable=False, unique=True)
    password_hash               = Column(Text, nullable=False)
    name                        = Column(String(255), nullable=False)
    # Stripe / subscription (inline)
    stripe_customer_id          = Column(String(255), unique=True)
    stripe_subscription_id      = Column(String(255), unique=True)
    stripe_subscription_item_id = Column(String(255))
    plan                        = Column(String(50), nullable=False, server_default='free')
    subscription_status         = Column(String(50), nullable=False, server_default='active')
    current_period_end          = Column(DateTime(timezone=True))
    cancel_at_period_end        = Column(Boolean, nullable=False, server_default='FALSE')
    payment_failed_at           = Column(DateTime(timezone=True))
    seat_count                  = Column(Integer, nullable=False, server_default='1')
    # Audit
    created_at                  = Column(DateTime(timezone=True), nullable=False, server_default='NOW()')
    updated_at                  = Column(DateTime(timezone=True), nullable=False, server_default='NOW()')

    # Relations
    password_reset_tokens = relationship('PasswordResetToken', back_populates='user', cascade='all, delete-orphan')
    api_keys              = relationship('ApiKey', back_populates='user', cascade='all, delete-orphan')
    usage_records         = relationship('Usage', back_populates='user', cascade='all, delete-orphan')
    owned_teams           = relationship('Team', back_populates='owner')
    team_memberships      = relationship('TeamMember', back_populates='user', cascade='all, delete-orphan')

    __table_args__ = (
        CheckConstraint("plan IN ('free', 'starter', 'pro', 'agency', 'unlimited')", name='ck_users_plan'),
        CheckConstraint("subscription_status IN ('none', 'trialing', 'active', 'past_due', 'cancelled', 'banned')", name='ck_users_subscription_status'),
    )

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email})>"


class PasswordResetToken(Base):
    __tablename__ = 'password_reset_tokens'

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id    = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used       = Column(Boolean, nullable=False, server_default='FALSE')
    created_at = Column(DateTime(timezone=True), nullable=False, server_default='NOW()')

    # Relations
    user = relationship('User', back_populates='password_reset_tokens')

    def __repr__(self):
        return f"<PasswordResetToken(id={self.id}, user_id={self.user_id})>"


class ApiKey(Base):
    __tablename__ = 'api_keys'

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id      = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    name         = Column(String(100), nullable=False)
    key          = Column(String(60), nullable=False, unique=True)
    is_active    = Column(Boolean, nullable=False, server_default='TRUE')
    last_used_at = Column(DateTime(timezone=True))
    created_at   = Column(DateTime(timezone=True), nullable=False, server_default='NOW()')

    # Relations
    user          = relationship('User', back_populates='api_keys')
    usage_records = relationship('Usage', back_populates='api_key', cascade='all, delete-orphan')

    def __repr__(self):
        return f"<ApiKey(id={self.id}, name={self.name}, is_active={self.is_active})>"


class Usage(Base):
    __tablename__ = 'usage'

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id    = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    api_key_id = Column(BigInteger, ForeignKey('api_keys.id', ondelete='CASCADE'), nullable=False)
    feature    = Column(String(30), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default='NOW()')

    # Relations
    user    = relationship('User', back_populates='usage_records')
    api_key = relationship('ApiKey', back_populates='usage_records')

    __table_args__ = (
        CheckConstraint("feature IN ('transcription', 'correction', 'derushing', 'normalization')", name='ck_usage_feature'),
    )

    def __repr__(self):
        return f"<Usage(id={self.id}, user_id={self.user_id}, feature={self.feature})>"


class StripeEvent(Base):
    __tablename__ = 'stripe_events'

    # Natural PK — Stripe event ID (evt_xxx), used for idempotency
    event_id   = Column(Text, primary_key=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default='NOW()')

    def __repr__(self):
        return f"<StripeEvent(event_id={self.event_id})>"


class Team(Base):
    __tablename__ = 'teams'

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    owner_id   = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    seat_count = Column(Integer, nullable=False, server_default='1')
    created_at = Column(DateTime(timezone=True), nullable=False, server_default='NOW()')

    # Relations
    owner   = relationship('User', back_populates='owned_teams')
    members = relationship('TeamMember', back_populates='team', cascade='all, delete-orphan')
    invites = relationship('TeamInvite', back_populates='team', cascade='all, delete-orphan')

    __table_args__ = (
        CheckConstraint('seat_count >= 1', name='ck_teams_seat_count'),
    )

    def __repr__(self):
        return f"<Team(id={self.id}, owner_id={self.owner_id})>"


class TeamMember(Base):
    __tablename__ = 'team_members'

    id        = Column(BigInteger, primary_key=True, autoincrement=True)
    team_id   = Column(BigInteger, ForeignKey('teams.id', ondelete='CASCADE'), nullable=False)
    user_id   = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    role      = Column(String(10), nullable=False)
    joined_at = Column(DateTime(timezone=True), nullable=False, server_default='NOW()')

    # Relations
    team = relationship('Team', back_populates='members')
    user = relationship('User', back_populates='team_memberships')

    __table_args__ = (
        CheckConstraint("role IN ('owner', 'member')", name='ck_team_members_role'),
    )

    def __repr__(self):
        return f"<TeamMember(id={self.id}, team_id={self.team_id}, user_id={self.user_id}, role={self.role})>"


class TeamInvite(Base):
    __tablename__ = 'team_invites'

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    team_id    = Column(BigInteger, ForeignKey('teams.id', ondelete='CASCADE'), nullable=False)
    email      = Column(String(255), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at    = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default='NOW()')

    # Relations
    team = relationship('Team', back_populates='invites')

    def __repr__(self):
        return f"<TeamInvite(id={self.id}, team_id={self.team_id}, email={self.email})>"
