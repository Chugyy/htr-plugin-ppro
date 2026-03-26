# tests/test_crud/test_user.py

import uuid
from datetime import datetime, timezone, timedelta

import pytest

from app.database.crud.user import (
    insert_user,
    get_user_by_email,
    get_user_by_id,
    get_user_by_stripe_subscription_id,
    update_user_password,
    update_user_subscription,
    insert_password_reset_token,
    get_password_reset_token,
    delete_password_reset_token,
    delete_expired_password_reset_tokens,
)
from app.database.db import _db_pool
import app.database.db as db_module


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@example.com"


def _future(hours: int = 1) -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=hours)


def _past(hours: int = 1) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=hours)


# ---------------------------------------------------------------------------
# Fixture: inject the session pool into the crud module's get_db_pool
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def patch_pool(pool, monkeypatch):
    """Make get_db_pool() return the test pool without re-connecting."""
    async def _get_pool():
        return pool
    monkeypatch.setattr(db_module, "get_db_pool", _get_pool)


# ---------------------------------------------------------------------------
# Cleanup helper
# ---------------------------------------------------------------------------

async def _delete_user(pool, user_id):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)


# ---------------------------------------------------------------------------
# insert_user
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_insert_user_returns_row(pool):
    email = _unique_email()
    result = await insert_user(
        email=email,
        password_hash="hash_bcrypt",
        name="Alice",
        stripe_customer_id=f"cus_{uuid.uuid4().hex[:14]}",
    )
    try:
        assert result["email"] == email
        assert result["name"] == "Alice"
        assert result["plan"] == "free"
        assert result["id"] is not None
        assert "created_at" in result
    finally:
        await _delete_user(pool, result["id"])


@pytest.mark.asyncio
async def test_insert_user_custom_plan(pool):
    email = _unique_email()
    result = await insert_user(
        email=email,
        password_hash="hash_bcrypt",
        name="Bob",
        stripe_customer_id=f"cus_{uuid.uuid4().hex[:14]}",
        plan="pro",
    )
    try:
        assert result["plan"] == "pro"
    finally:
        await _delete_user(pool, result["id"])


@pytest.mark.asyncio
async def test_insert_user_duplicate_email_raises(pool):
    email = _unique_email()
    result = await insert_user(
        email=email,
        password_hash="h",
        name="Charlie",
        stripe_customer_id=f"cus_{uuid.uuid4().hex[:14]}",
    )
    try:
        import asyncpg
        with pytest.raises(asyncpg.UniqueViolationError):
            await insert_user(
                email=email,
                password_hash="h2",
                name="Charlie2",
                stripe_customer_id=f"cus_{uuid.uuid4().hex[:14]}",
            )
    finally:
        await _delete_user(pool, result["id"])


# ---------------------------------------------------------------------------
# get_user_by_email
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_user_by_email_found(pool):
    email = _unique_email()
    created = await insert_user(email, "h", "Dave", f"cus_{uuid.uuid4().hex[:14]}")
    try:
        row = await get_user_by_email(email)
        assert row is not None
        assert row["email"] == email
        assert "password_hash" in row
    finally:
        await _delete_user(pool, created["id"])


@pytest.mark.asyncio
async def test_get_user_by_email_not_found():
    row = await get_user_by_email("nonexistent_xyz@nowhere.com")
    assert row is None


# ---------------------------------------------------------------------------
# get_user_by_id
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_user_by_id_found(pool):
    email = _unique_email()
    created = await insert_user(email, "h", "Eve", f"cus_{uuid.uuid4().hex[:14]}")
    try:
        row = await get_user_by_id(str(created["id"]))
        assert row is not None
        assert str(row["id"]) == str(created["id"])
        assert "password_hash" not in row  # SELECT does not expose hash
    finally:
        await _delete_user(pool, created["id"])


@pytest.mark.asyncio
async def test_get_user_by_id_not_found():
    row = await get_user_by_id(str(uuid.uuid4()))
    assert row is None


# ---------------------------------------------------------------------------
# get_user_by_stripe_subscription_id
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_user_by_stripe_subscription_id(pool):
    email = _unique_email()
    sub_id = f"sub_{uuid.uuid4().hex[:14]}"
    created = await insert_user(email, "h", "Frank", f"cus_{uuid.uuid4().hex[:14]}")
    try:
        # Set stripe_subscription_id directly
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET stripe_subscription_id = $1 WHERE id = $2",
                sub_id, created["id"],
            )
        row = await get_user_by_stripe_subscription_id(sub_id)
        assert row is not None
        assert row["stripe_subscription_id"] == sub_id
    finally:
        await _delete_user(pool, created["id"])


@pytest.mark.asyncio
async def test_get_user_by_stripe_subscription_id_not_found():
    row = await get_user_by_stripe_subscription_id("sub_doesnotexist")
    assert row is None


# ---------------------------------------------------------------------------
# update_user_password
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_user_password(pool):
    email = _unique_email()
    created = await insert_user(email, "old_hash", "Grace", f"cus_{uuid.uuid4().hex[:14]}")
    try:
        await update_user_password(str(created["id"]), "new_hash")
        row = await get_user_by_email(email)
        assert row["password_hash"] == "new_hash"
    finally:
        await _delete_user(pool, created["id"])


# ---------------------------------------------------------------------------
# update_user_subscription
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_user_subscription(pool):
    email = _unique_email()
    created = await insert_user(email, "h", "Hank", f"cus_{uuid.uuid4().hex[:14]}")
    try:
        await update_user_subscription(str(created["id"]), {
            "plan": "starter",
            "subscription_status": "trialing",
        })
        row = await get_user_by_id(str(created["id"]))
        assert row["plan"] == "starter"
        assert row["subscription_status"] == "trialing"
    finally:
        await _delete_user(pool, created["id"])


@pytest.mark.asyncio
async def test_update_user_subscription_ignores_unknown_fields(pool):
    email = _unique_email()
    created = await insert_user(email, "h", "Iris", f"cus_{uuid.uuid4().hex[:14]}")
    try:
        # Should not raise — unknown keys are silently dropped
        await update_user_subscription(str(created["id"]), {"unknown_field": "value"})
    finally:
        await _delete_user(pool, created["id"])


@pytest.mark.asyncio
async def test_update_user_subscription_empty_dict_is_noop(pool):
    email = _unique_email()
    created = await insert_user(email, "h", "Jack", f"cus_{uuid.uuid4().hex[:14]}")
    try:
        await update_user_subscription(str(created["id"]), {})
        # No exception = success
    finally:
        await _delete_user(pool, created["id"])


# ---------------------------------------------------------------------------
# insert_password_reset_token
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_insert_password_reset_token(pool):
    email = _unique_email()
    created = await insert_user(email, "h", "Kate", f"cus_{uuid.uuid4().hex[:14]}")
    token_hash = uuid.uuid4().hex
    try:
        await insert_password_reset_token(str(created["id"]), token_hash, _future())
        row = await get_password_reset_token(token_hash)
        assert row is not None
        assert str(row["user_id"]) == str(created["id"])
    finally:
        await _delete_user(pool, created["id"])


@pytest.mark.asyncio
async def test_insert_password_reset_token_purges_previous(pool):
    email = _unique_email()
    created = await insert_user(email, "h", "Leo", f"cus_{uuid.uuid4().hex[:14]}")
    old_hash = uuid.uuid4().hex
    new_hash = uuid.uuid4().hex
    try:
        await insert_password_reset_token(str(created["id"]), old_hash, _future())
        await insert_password_reset_token(str(created["id"]), new_hash, _future())
        assert await get_password_reset_token(old_hash) is None
        assert await get_password_reset_token(new_hash) is not None
    finally:
        await _delete_user(pool, created["id"])


# ---------------------------------------------------------------------------
# get_password_reset_token
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_password_reset_token_not_found():
    row = await get_password_reset_token("nonexistent_hash_xyz")
    assert row is None


@pytest.mark.asyncio
async def test_get_password_reset_token_fields(pool):
    email = _unique_email()
    created = await insert_user(email, "h", "Mia", f"cus_{uuid.uuid4().hex[:14]}")
    token_hash = uuid.uuid4().hex
    try:
        await insert_password_reset_token(str(created["id"]), token_hash, _future())
        row = await get_password_reset_token(token_hash)
        assert "user_id" in row
        assert "expires_at" in row
        assert "used" in row
    finally:
        await _delete_user(pool, created["id"])


# ---------------------------------------------------------------------------
# delete_password_reset_token
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_password_reset_token(pool):
    email = _unique_email()
    created = await insert_user(email, "h", "Ned", f"cus_{uuid.uuid4().hex[:14]}")
    token_hash = uuid.uuid4().hex
    try:
        await insert_password_reset_token(str(created["id"]), token_hash, _future())
        await delete_password_reset_token(token_hash)
        assert await get_password_reset_token(token_hash) is None
    finally:
        await _delete_user(pool, created["id"])


# ---------------------------------------------------------------------------
# delete_expired_password_reset_tokens
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_expired_password_reset_tokens(pool):
    email = _unique_email()
    created = await insert_user(email, "h", "Olivia", f"cus_{uuid.uuid4().hex[:14]}")
    expired_hash = uuid.uuid4().hex
    valid_hash = uuid.uuid4().hex
    try:
        # Insert one expired and one valid token (bypass insert_password_reset_token
        # to avoid the purge-before-insert policy deleting the first one)
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
                created["id"], expired_hash, _past(2),
            )
            await conn.execute(
                "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
                created["id"], valid_hash, _future(2),
            )

        count = await delete_expired_password_reset_tokens()
        assert count >= 1
        assert await get_password_reset_token(expired_hash) is None
        assert await get_password_reset_token(valid_hash) is not None
    finally:
        await _delete_user(pool, created["id"])
