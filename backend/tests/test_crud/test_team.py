# tests/test_crud/test_team.py

import pytest
import uuid
import hashlib
from datetime import datetime, timedelta, timezone

from app.database.db import get_db_pool
from app.database.crud.team import (
    create_team,
    get_team_by_owner,
    get_team_with_member_count,
    list_team_members,
    add_team_member,
    remove_team_member,
    update_team_seat_count,
    get_team_member,
    create_team_invite,
    get_team_invite_by_token,
    mark_invite_used,
    get_pending_invites,
    deactivate_user_api_keys,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_user(conn, email: str | None = None) -> str:
    """Insert a minimal user row. Returns user id (UUID string)."""
    user_id = str(uuid.uuid4())
    email = email or f"user_{user_id[:8]}@test.com"
    await conn.execute(
        """
        INSERT INTO users (id, email, password_hash, name)
        VALUES ($1, $2, 'hash', 'Test User')
        """,
        user_id, email
    )
    return user_id


async def _create_api_key(conn, user_id: str) -> int:
    """Insert an active api_key row for user. Returns key id."""
    row = await conn.fetchrow(
        """
        INSERT INTO api_keys (user_id, name, key, is_active)
        VALUES ($1, 'Default', $2, TRUE)
        RETURNING id
        """,
        user_id, f"dk_{uuid.uuid4().hex[:32]}"
    )
    return row["id"]


def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
async def pool():
    return await get_db_pool()


@pytest.fixture(scope="function")
async def owner_id(pool):
    async with pool.acquire() as conn:
        uid = await _create_user(conn)
    yield uid
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", uid)


@pytest.fixture(scope="function")
async def team(owner_id):
    result = await create_team(owner_id, seat_count=3)
    yield result
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM teams WHERE id = $1", result["id"])


# ---------------------------------------------------------------------------
# create_team
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_team(owner_id):
    pool = await get_db_pool()
    result = await create_team(owner_id, seat_count=5)

    assert result["owner_id"] == owner_id
    assert result["seat_count"] == 5
    assert result["id"] is not None
    assert result["created_at"] is not None

    # owner must be in team_members with role=owner
    async with pool.acquire() as conn:
        member = await conn.fetchrow(
            "SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2",
            result["id"], owner_id
        )
    assert member is not None
    assert member["role"] == "owner"

    # cleanup
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM teams WHERE id = $1", result["id"])


# ---------------------------------------------------------------------------
# get_team_by_owner
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_team_by_owner(team, owner_id):
    result = await get_team_by_owner(owner_id)
    assert result is not None
    assert result["owner_id"] == owner_id
    assert result["id"] == team["id"]


@pytest.mark.asyncio
async def test_get_team_by_owner_not_found():
    result = await get_team_by_owner(str(uuid.uuid4()))
    assert result is None


# ---------------------------------------------------------------------------
# get_team_with_member_count
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_team_with_member_count(team):
    result = await get_team_with_member_count(team["id"])
    assert result is not None
    assert result["id"] == team["id"]
    assert result["member_count"] >= 1  # owner always present


@pytest.mark.asyncio
async def test_get_team_with_member_count_not_found():
    result = await get_team_with_member_count(999999999)
    assert result is None


# ---------------------------------------------------------------------------
# list_team_members
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_team_members(team, owner_id):
    results = await list_team_members(team["id"])
    assert len(results) >= 1
    owner_entry = next((r for r in results if r["user_id"] == owner_id), None)
    assert owner_entry is not None
    assert owner_entry["role"] == "owner"
    assert "usage_this_month" in owner_entry
    assert owner_entry["usage_this_month"] >= 0


@pytest.mark.asyncio
async def test_list_team_members_with_month(team):
    results = await list_team_members(team["id"], month=datetime.utcnow())
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_list_team_members_empty_team():
    # Team that doesn't exist → empty list
    results = await list_team_members(999999999)
    assert results == []


# ---------------------------------------------------------------------------
# add_team_member / get_team_member / remove_team_member
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_add_team_member(team):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        member_id = await _create_user(conn)

    row = await add_team_member(team["id"], member_id, role="member")
    assert row["team_id"] == team["id"]
    assert row["user_id"] == member_id
    assert row["role"] == "member"
    assert row["joined_at"] is not None

    # cleanup
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", member_id)


@pytest.mark.asyncio
async def test_get_team_member_exists(team, owner_id):
    row = await get_team_member(team["id"], owner_id)
    assert row is not None
    assert row["user_id"] == owner_id
    assert row["role"] == "owner"


@pytest.mark.asyncio
async def test_get_team_member_not_found(team):
    row = await get_team_member(team["id"], str(uuid.uuid4()))
    assert row is None


@pytest.mark.asyncio
async def test_remove_team_member(team):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        member_id = await _create_user(conn)

    await add_team_member(team["id"], member_id)
    removed = await remove_team_member(team["id"], member_id)
    assert removed is True

    row = await get_team_member(team["id"], member_id)
    assert row is None

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", member_id)


@pytest.mark.asyncio
async def test_remove_team_member_not_found(team):
    removed = await remove_team_member(team["id"], str(uuid.uuid4()))
    assert removed is False


# ---------------------------------------------------------------------------
# update_team_seat_count
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_team_seat_count(team):
    await update_team_seat_count(team["id"], 10)
    result = await get_team_with_member_count(team["id"])
    assert result["seat_count"] == 10


# ---------------------------------------------------------------------------
# create_team_invite / get_team_invite_by_token / get_pending_invites
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_team_invite(team):
    raw = uuid.uuid4().hex
    token_hash = _token_hash(raw)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    row = await create_team_invite(team["id"], "invite@test.com", token_hash, expires_at)
    assert row["email"] == "invite@test.com"
    assert row["team_id"] == team["id"]
    assert row["id"] is not None


@pytest.mark.asyncio
async def test_get_team_invite_by_token_valid(team):
    raw = uuid.uuid4().hex
    token_hash = _token_hash(raw)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    created = await create_team_invite(team["id"], "find@test.com", token_hash, expires_at)

    row = await get_team_invite_by_token(token_hash)
    assert row is not None
    assert row["id"] == created["id"]
    assert row["email"] == "find@test.com"


@pytest.mark.asyncio
async def test_get_team_invite_by_token_expired(team):
    raw = uuid.uuid4().hex
    token_hash = _token_hash(raw)
    expires_at = datetime.now(timezone.utc) - timedelta(hours=1)  # already expired
    await create_team_invite(team["id"], "expired@test.com", token_hash, expires_at)

    row = await get_team_invite_by_token(token_hash)
    assert row is None


@pytest.mark.asyncio
async def test_get_team_invite_by_token_not_found():
    row = await get_team_invite_by_token("0" * 64)
    assert row is None


@pytest.mark.asyncio
async def test_get_pending_invites(team):
    raw1 = uuid.uuid4().hex
    raw2 = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    await create_team_invite(team["id"], "a@test.com", _token_hash(raw1), expires_at)
    await create_team_invite(team["id"], "b@test.com", _token_hash(raw2), expires_at)

    rows = await get_pending_invites(team["id"])
    emails = [r["email"] for r in rows]
    assert "a@test.com" in emails
    assert "b@test.com" in emails


@pytest.mark.asyncio
async def test_get_pending_invites_excludes_used(team):
    raw = uuid.uuid4().hex
    token_hash = _token_hash(raw)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    invite = await create_team_invite(team["id"], "used@test.com", token_hash, expires_at)

    await mark_invite_used(invite["id"])

    rows = await get_pending_invites(team["id"])
    assert all(r["email"] != "used@test.com" for r in rows)


# ---------------------------------------------------------------------------
# mark_invite_used
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_mark_invite_used(team):
    raw = uuid.uuid4().hex
    token_hash = _token_hash(raw)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    invite = await create_team_invite(team["id"], "mark@test.com", token_hash, expires_at)

    await mark_invite_used(invite["id"])

    # Should no longer be returned by get_team_invite_by_token
    row = await get_team_invite_by_token(token_hash)
    assert row is None

    # Verify used_at is set in DB
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        raw_row = await conn.fetchrow(
            "SELECT used_at FROM team_invites WHERE id = $1", invite["id"]
        )
    assert raw_row["used_at"] is not None


# ---------------------------------------------------------------------------
# deactivate_user_api_keys
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_deactivate_user_api_keys():
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        user_id = await _create_user(conn)
        await _create_api_key(conn, user_id)
        await _create_api_key(conn, user_id)

    count = await deactivate_user_api_keys(user_id)
    assert count == 2

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id FROM api_keys WHERE user_id = $1 AND is_active = TRUE", user_id
        )
    assert len(rows) == 0

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)


@pytest.mark.asyncio
async def test_deactivate_user_api_keys_already_inactive():
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        user_id = await _create_user(conn)
        await conn.execute(
            "INSERT INTO api_keys (user_id, name, key, is_active) VALUES ($1, 'k', $2, FALSE)",
            user_id, f"dk_{uuid.uuid4().hex[:32]}"
        )

    count = await deactivate_user_api_keys(user_id)
    assert count == 0

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)


@pytest.mark.asyncio
async def test_deactivate_user_api_keys_no_keys():
    count = await deactivate_user_api_keys(str(uuid.uuid4()))
    assert count == 0
