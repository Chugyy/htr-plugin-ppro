"""
E2E tests for team jobs.

Prerequisites:
- A running PostgreSQL database (uses the shared `pool` fixture from conftest.py)
- SMTP and Stripe creds are NOT required — those tests are marked skip when absent.

Coverage:
- invite_team_member: seats check, duplicate invite guard, happy path
- accept_team_invite: invalid / expired / used token, happy path
- remove_team_member: owner guard, non-member guard, happy path
- add_team_seats: Stripe integration (skipped without live creds)
"""

import pytest
from datetime import datetime, timezone, timedelta

from app.core.jobs.team import (
    invite_team_member,
    accept_team_invite,
    remove_team_member,
    add_team_seats,
    SeatsExhaustedError,
    InviteAlreadyPendingError,
    InviteNotFoundError,
    InviteAlreadyUsedError,
    InviteExpiredError,
    CannotRemoveOwnerError,
    MemberNotFoundError,
    ForbiddenError,
    SubscriptionNotFoundError,
    _generate_invite_token,
)
from app.core.utils.auth import hash_token
from config.config import settings


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def owner(pool):
    """Create a minimal owner user directly in DB."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (email, password_hash, name, stripe_customer_id, plan, subscription_status, created_at, updated_at)
            VALUES ('owner@test.com', 'hash', 'Owner', 'cus_test', 'agency', 'active', NOW(), NOW())
            RETURNING id, email, name, plan
            """,
        )
        return dict(row)


@pytest.fixture
async def team(pool, owner):
    """Create a team owned by `owner` with 3 seats."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            t = await conn.fetchrow(
                "INSERT INTO teams (owner_id, seat_count) VALUES ($1, 3) RETURNING id, owner_id, seat_count",
                owner["id"],
            )
            await conn.execute(
                "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')",
                t["id"], owner["id"],
            )
    return dict(t)


@pytest.fixture(autouse=True)
async def cleanup(pool):
    """Rollback all test data after each test."""
    yield
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM team_invites WHERE email LIKE '%@test.com'")
        await conn.execute("DELETE FROM api_keys WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')")
        await conn.execute("DELETE FROM team_members WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')")
        await conn.execute("DELETE FROM teams WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')")
        await conn.execute("DELETE FROM users WHERE email LIKE '%@test.com'")


# ---------------------------------------------------------------------------
# invite_team_member
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_invite_seats_exhausted(pool, owner, team):
    """Filling all seats then inviting raises SeatsExhaustedError."""
    async with pool.acquire() as conn:
        for i in range(2):  # 1 owner already in, seat_count=3 → 2 more slots
            u = await conn.fetchrow(
                "INSERT INTO users (email, password_hash, name, stripe_customer_id, plan, subscription_status, created_at, updated_at) "
                "VALUES ($1, 'h', 'M', '', 'free', 'active', NOW(), NOW()) RETURNING id",
                f"member{i}@test.com",
            )
            await conn.execute(
                "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')",
                team["id"], u["id"],
            )

    with pytest.raises(SeatsExhaustedError):
        await invite_team_member(
            owner_id=owner["id"],
            team_id=team["id"],
            email="overflow@test.com",
        )


@pytest.mark.asyncio
async def test_invite_duplicate_pending(pool, owner, team):
    """A second invite for the same email raises InviteAlreadyPendingError."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO team_invites (team_id, email, token_hash, expires_at)
            VALUES ($1, 'dup@test.com', 'hash_dup', NOW() + INTERVAL '24h')
            """,
            team["id"],
        )

    with pytest.raises(InviteAlreadyPendingError):
        await invite_team_member(
            owner_id=owner["id"],
            team_id=team["id"],
            email="dup@test.com",
        )


@pytest.mark.asyncio
async def test_invite_forbidden(pool, owner, team):
    """Non-owner calling invite raises ForbiddenError."""
    with pytest.raises(ForbiddenError):
        await invite_team_member(
            owner_id=owner["id"] + 9999,
            team_id=team["id"],
            email="someone@test.com",
        )


@pytest.mark.skipif(
    not settings.smtp_host,
    reason="SMTP not configured — skipping live email send",
)
@pytest.mark.asyncio
async def test_invite_happy_path(pool, owner, team):
    """Full invite flow: invite row created and email sent."""
    result = await invite_team_member(
        owner_id=owner["id"],
        team_id=team["id"],
        email="invitee@test.com",
    )
    assert result["invite_id"] is not None
    assert result["email"] == "invitee@test.com"
    assert result["expires_at"] > datetime.now(timezone.utc)

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM team_invites WHERE email = 'invitee@test.com' AND team_id = $1",
            team["id"],
        )
    assert row is not None


# ---------------------------------------------------------------------------
# accept_team_invite
# ---------------------------------------------------------------------------

@pytest.fixture
async def pending_invite(pool, team):
    """Insert a fresh pending invite and return (raw_token, invite_id)."""
    raw, token_hash = _generate_invite_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO team_invites (team_id, email, token_hash, expires_at)
            VALUES ($1, 'newmember@test.com', $2, $3)
            RETURNING id
            """,
            team["id"], token_hash, expires_at,
        )
    return raw, row["id"]


@pytest.mark.asyncio
async def test_accept_invite_invalid_token(pool, team):
    """Random token raises InviteNotFoundError."""
    with pytest.raises(InviteNotFoundError):
        await accept_team_invite(
            raw_token="notarealtoken",
            email="x@test.com",
            password="password123",
            name="Nobody",
        )


@pytest.mark.asyncio
async def test_accept_invite_already_used(pool, team, pending_invite):
    """Consuming then re-consuming raises InviteAlreadyUsedError."""
    raw_token, invite_id = pending_invite
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE team_invites SET used_at = NOW() WHERE id = $1", invite_id
        )

    with pytest.raises(InviteAlreadyUsedError):
        await accept_team_invite(
            raw_token=raw_token,
            email="newmember@test.com",
            password="password123",
            name="New Member",
        )


@pytest.mark.asyncio
async def test_accept_invite_expired(pool, team, pending_invite):
    """Expired invite raises InviteExpiredError."""
    raw_token, invite_id = pending_invite
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE team_invites SET expires_at = NOW() - INTERVAL '1h' WHERE id = $1",
            invite_id,
        )

    with pytest.raises(InviteExpiredError):
        await accept_team_invite(
            raw_token=raw_token,
            email="newmember@test.com",
            password="password123",
            name="New Member",
        )


@pytest.mark.asyncio
async def test_accept_invite_happy_path(pool, team, pending_invite):
    """Full accept flow: user + team_member + api_key created, invite marked used."""
    raw_token, invite_id = pending_invite

    result = await accept_team_invite(
        raw_token=raw_token,
        email="newmember@test.com",
        password="password123",
        name="New Member",
    )

    assert result["user_id"] is not None
    assert result["api_key"].startswith("dk_")
    assert result["jwt_token"]

    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = 'newmember@test.com'")
        assert user is not None

        member = await conn.fetchrow(
            "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2",
            team["id"], user["id"],
        )
        assert member is not None

        key = await conn.fetchrow(
            "SELECT id FROM api_keys WHERE user_id = $1 AND is_active = TRUE",
            user["id"],
        )
        assert key is not None

        invite = await conn.fetchrow(
            "SELECT used_at FROM team_invites WHERE id = $1", invite_id
        )
        assert invite["used_at"] is not None


# ---------------------------------------------------------------------------
# remove_team_member
# ---------------------------------------------------------------------------

@pytest.fixture
async def member(pool, team):
    """Create a regular team member and return their user dict."""
    async with pool.acquire() as conn:
        u = await conn.fetchrow(
            "INSERT INTO users (email, password_hash, name, stripe_customer_id, plan, subscription_status, created_at, updated_at) "
            "VALUES ('member@test.com', 'h', 'Member', '', 'free', 'active', NOW(), NOW()) RETURNING id, email",
        )
        await conn.execute(
            "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')",
            team["id"], u["id"],
        )
        await conn.execute(
            "INSERT INTO api_keys (user_id, name, key) VALUES ($1, 'Default', $2)",
            u["id"], f"dk_testkey_{u['id']}",
        )
    return dict(u)


@pytest.mark.asyncio
async def test_remove_member_cannot_remove_owner(pool, owner, team):
    """Removing the owner raises CannotRemoveOwnerError."""
    with pytest.raises(CannotRemoveOwnerError):
        await remove_team_member(
            owner_id=owner["id"],
            team_id=team["id"],
            user_id=owner["id"],
        )


@pytest.mark.asyncio
async def test_remove_member_not_found(pool, owner, team):
    """Removing a non-member raises MemberNotFoundError."""
    with pytest.raises(MemberNotFoundError):
        await remove_team_member(
            owner_id=owner["id"],
            team_id=team["id"],
            user_id=owner["id"] + 9999,
        )


@pytest.mark.asyncio
async def test_remove_member_happy_path(pool, owner, team, member):
    """Full remove flow: team_member deleted, API keys deactivated."""
    await remove_team_member(
        owner_id=owner["id"],
        team_id=team["id"],
        user_id=member["id"],
    )

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2",
            team["id"], member["id"],
        )
        assert row is None

        active_keys = await conn.fetchval(
            "SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND is_active = TRUE",
            member["id"],
        )
        assert active_keys == 0


# ---------------------------------------------------------------------------
# add_team_seats
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not settings.stripe_secret_key,
    reason="Stripe not configured — skipping live API call",
)
@pytest.mark.asyncio
async def test_add_seats_no_subscription(pool, owner, team):
    """Owner without a Stripe subscription raises SubscriptionNotFoundError."""
    with pytest.raises(SubscriptionNotFoundError):
        await add_team_seats(
            owner_id=owner["id"],
            team_id=team["id"],
            quantity_to_add=2,
        )


@pytest.mark.skipif(
    not settings.stripe_secret_key,
    reason="Stripe not configured — skipping live API call",
)
@pytest.mark.asyncio
async def test_add_seats_happy_path(pool, owner, team):
    """
    Full add_seats flow — requires live Stripe creds with a valid subscription.
    TODO: verify Stripe proration invoice when Stripe test mode is active.
    """
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET stripe_subscription_id = 'sub_test', stripe_subscription_item_id = 'si_test' WHERE id = $1",
            owner["id"],
        )

    result = await add_team_seats(
        owner_id=owner["id"],
        team_id=team["id"],
        quantity_to_add=2,
    )

    assert result["team_id"] == team["id"]
    assert result["new_seat_count"] == team["seat_count"] + 2

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT seat_count FROM teams WHERE id = $1", team["id"])
        assert row["seat_count"] == team["seat_count"] + 2
