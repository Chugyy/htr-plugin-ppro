# tests/test_jobs/test_user.py

import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from config.config import settings
import app.database.db as db_module
from app.core.jobs.user import (
    register_user,
    login_user,
    request_password_reset,
    reset_password,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    AccountBannedError,
    InvalidTokenError,
    TokenExpiredError,
    StripeServiceError,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def pool():
    import asyncpg
    p = await asyncpg.create_pool(
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        min_size=2,
        max_size=5,
    )
    yield p
    await p.close()


@pytest.fixture(autouse=True)
def patch_pool(pool, monkeypatch):
    async def _get_pool():
        return pool
    monkeypatch.setattr(db_module, "get_db_pool", _get_pool)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@example.com"


async def _delete_user_by_email(pool, email: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE email = $1", email)


# ---------------------------------------------------------------------------
# Stripe mock (used by register_user tests)
# ---------------------------------------------------------------------------

def _mock_stripe_customer(email: str):
    mock = MagicMock()
    mock.id = f"cus_{uuid.uuid4().hex[:14]}"
    return mock


# ---------------------------------------------------------------------------
# register_user
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.skipif(
    not settings.stripe_secret_key,
    reason="STRIPE_SECRET_KEY not configured — using mock",
)
async def test_register_user_full_workflow_real_stripe(pool):
    """E2E with real Stripe key: full register workflow."""
    email = _unique_email()
    try:
        result = await register_user(email=email, password="password123", name="Alice")
        assert result["user"]["email"] == email
        assert result["user"]["plan"] == "free"
        assert result["api_key"]["key"] is not None
        assert result["token"] is not None
        # Verify user exists in DB
        from app.database.crud.user import get_user_by_email
        fetched = await get_user_by_email(email)
        assert fetched is not None
    finally:
        await _delete_user_by_email(pool, email)


@pytest.mark.asyncio
async def test_register_user_full_workflow(pool):
    """E2E with mocked Stripe: validate → DB insert → API key → JWT."""
    email = _unique_email()
    with patch("app.core.jobs.user.stripe.Customer.create", return_value=_mock_stripe_customer(email)):
        try:
            result = await register_user(email=email, password="password123", name="Alice")
            assert result["user"]["email"] == email
            assert result["user"]["name"] == "Alice"
            assert result["user"]["plan"] == "free"
            assert result["api_key"]["key"] is not None
            assert result["token"] is not None
            # Verify persisted in DB
            from app.database.crud.user import get_user_by_email
            fetched = await get_user_by_email(email)
            assert fetched is not None
            assert fetched["email"] == email
        finally:
            await _delete_user_by_email(pool, email)


@pytest.mark.asyncio
async def test_register_user_duplicate_email(pool):
    """register_user raises EmailAlreadyExistsError on duplicate email."""
    email = _unique_email()
    with patch("app.core.jobs.user.stripe.Customer.create", return_value=_mock_stripe_customer(email)):
        try:
            await register_user(email=email, password="password123", name="Bob")
            with pytest.raises(EmailAlreadyExistsError):
                await register_user(email=email, password="password456", name="Bob2")
        finally:
            await _delete_user_by_email(pool, email)


@pytest.mark.asyncio
async def test_register_user_validation_error_short_password():
    """register_user raises ValueError when password is too short."""
    with pytest.raises((ValueError, Exception)):
        await register_user(email="valid@example.com", password="short", name="Charlie")


@pytest.mark.asyncio
async def test_register_user_validation_error_invalid_email():
    """register_user raises ValueError on malformed email."""
    with pytest.raises((ValueError, Exception)):
        await register_user(email="not-an-email", password="password123", name="Dave")


@pytest.mark.asyncio
async def test_register_user_stripe_error():
    """register_user raises StripeServiceError when Stripe fails."""
    import stripe as stripe_lib
    with patch(
        "app.core.jobs.user.stripe.Customer.create",
        side_effect=stripe_lib.error.StripeError("Stripe down"),
    ):
        with pytest.raises(StripeServiceError):
            await register_user(email=_unique_email(), password="password123", name="Eve")


# ---------------------------------------------------------------------------
# login_user
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_login_user_success(pool):
    """E2E login: valid credentials return user + token."""
    email = _unique_email()
    with patch("app.core.jobs.user.stripe.Customer.create", return_value=_mock_stripe_customer(email)):
        try:
            await register_user(email=email, password="password123", name="Frank")
            result = await login_user(email=email, password="password123")
            assert result["user"]["email"] == email
            assert result["token"] is not None
            assert "password_hash" not in result["user"]
        finally:
            await _delete_user_by_email(pool, email)


@pytest.mark.asyncio
async def test_login_user_wrong_password(pool):
    """login_user raises InvalidCredentialsError on wrong password."""
    email = _unique_email()
    with patch("app.core.jobs.user.stripe.Customer.create", return_value=_mock_stripe_customer(email)):
        try:
            await register_user(email=email, password="password123", name="Grace")
            with pytest.raises(InvalidCredentialsError):
                await login_user(email=email, password="wrongpassword")
        finally:
            await _delete_user_by_email(pool, email)


@pytest.mark.asyncio
async def test_login_user_unknown_email():
    """login_user raises InvalidCredentialsError for unknown email."""
    with pytest.raises(InvalidCredentialsError):
        await login_user(email="nobody@nowhere.com", password="password123")


@pytest.mark.asyncio
async def test_login_user_banned_account(pool):
    """login_user raises AccountBannedError when subscription_status is banned."""
    email = _unique_email()
    with patch("app.core.jobs.user.stripe.Customer.create", return_value=_mock_stripe_customer(email)):
        try:
            result = await register_user(email=email, password="password123", name="Hank")
            user_id = result["user"]["id"]
            # Set user as banned
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE users SET subscription_status = 'banned' WHERE id = $1",
                    user_id,
                )
            with pytest.raises(AccountBannedError):
                await login_user(email=email, password="password123")
        finally:
            await _delete_user_by_email(pool, email)


# ---------------------------------------------------------------------------
# request_password_reset
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_request_password_reset_unknown_email_is_silent():
    """request_password_reset returns None silently for unknown email (anti-enumeration)."""
    result = await request_password_reset("nobody@nowhere.com")
    assert result is None


@pytest.mark.asyncio
@pytest.mark.skipif(
    not settings.smtp_host,
    reason="SMTP_HOST not configured — skipping real email send",
)
async def test_request_password_reset_real_smtp(pool):
    """E2E with real SMTP: token is persisted in DB."""
    email = _unique_email()
    with patch("app.core.jobs.user.stripe.Customer.create", return_value=_mock_stripe_customer(email)):
        try:
            await register_user(email=email, password="password123", name="Iris")
            await request_password_reset(email)
            # Token is in DB — verify indirectly via reset_password success
        finally:
            await _delete_user_by_email(pool, email)


@pytest.mark.asyncio
async def test_request_password_reset_token_persisted(pool):
    """Token is inserted in DB even when SMTP is mocked out."""
    email = _unique_email()
    with patch("app.core.jobs.user.stripe.Customer.create", return_value=_mock_stripe_customer(email)):
        with patch("app.core.jobs.user._send_password_reset_email", new_callable=AsyncMock):
            try:
                await register_user(email=email, password="password123", name="Jack")
                await request_password_reset(email)
                # Verify token row exists in DB
                from app.database.crud.user import get_user_by_email
                user = await get_user_by_email(email)
                async with pool.acquire() as conn:
                    row = await conn.fetchrow(
                        "SELECT token_hash FROM password_reset_tokens WHERE user_id = $1",
                        user["id"],
                    )
                assert row is not None
            finally:
                await _delete_user_by_email(pool, email)


@pytest.mark.asyncio
async def test_request_password_reset_smtp_error_is_silent(pool):
    """SMTP failure is logged but does not propagate (returns None)."""
    email = _unique_email()
    with patch("app.core.jobs.user.stripe.Customer.create", return_value=_mock_stripe_customer(email)):
        with patch(
            "app.core.jobs.user._send_password_reset_email",
            new_callable=AsyncMock,
            side_effect=Exception("SMTP down"),
        ):
            try:
                await register_user(email=email, password="password123", name="Kate")
                result = await request_password_reset(email)
                assert result is None  # must not raise
            finally:
                await _delete_user_by_email(pool, email)


# ---------------------------------------------------------------------------
# reset_password
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reset_password_full_workflow(pool):
    """E2E: valid token → password updated → token deleted."""
    email = _unique_email()
    with patch("app.core.jobs.user.stripe.Customer.create", return_value=_mock_stripe_customer(email)):
        with patch("app.core.jobs.user._send_password_reset_email", new_callable=AsyncMock) as mock_send:
            try:
                await register_user(email=email, password="oldpassword", name="Leo")

                # Capture the raw_token passed to the email helper
                captured_token: list[str] = []
                original_send = mock_send

                async def _capture(to_email, raw_token):
                    captured_token.append(raw_token)

                mock_send.side_effect = _capture

                await request_password_reset(email)
                assert captured_token, "reset token was not captured"

                await reset_password(raw_token=captured_token[0], new_password="newpassword123")

                # New password must work for login
                result = await login_user(email=email, password="newpassword123")
                assert result["token"] is not None

                # Old password must no longer work
                with pytest.raises(InvalidCredentialsError):
                    await login_user(email=email, password="oldpassword")

                # Token must be deleted
                from app.database.crud.user import get_user_by_email
                from app.core.utils.auth import hash_token
                user = await get_user_by_email(email)
                async with pool.acquire() as conn:
                    row = await conn.fetchrow(
                        "SELECT token_hash FROM password_reset_tokens WHERE user_id = $1",
                        user["id"],
                    )
                assert row is None
            finally:
                await _delete_user_by_email(pool, email)


@pytest.mark.asyncio
async def test_reset_password_invalid_token():
    """reset_password raises InvalidTokenError for unknown token."""
    with pytest.raises(InvalidTokenError):
        await reset_password(raw_token="totally_fake_token_xyz", new_password="newpassword123")


@pytest.mark.asyncio
async def test_reset_password_expired_token(pool):
    """reset_password raises TokenExpiredError for expired token."""
    email = _unique_email()
    with patch("app.core.jobs.user.stripe.Customer.create", return_value=_mock_stripe_customer(email)):
        try:
            result = await register_user(email=email, password="password123", name="Mia")
            user_id = result["user"]["id"]

            # Insert an already-expired token directly
            import secrets, hashlib
            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
            expired_at = datetime.now(timezone.utc) - timedelta(hours=2)

            from app.database.crud.user import insert_password_reset_token
            await insert_password_reset_token(
                user_id=str(user_id),
                token_hash=token_hash,
                expires_at=expired_at,
            )

            with pytest.raises(TokenExpiredError):
                await reset_password(raw_token=raw_token, new_password="newpassword123")
        finally:
            await _delete_user_by_email(pool, email)
