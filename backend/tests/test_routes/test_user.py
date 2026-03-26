#!/usr/bin/env python3
# tests/test_routes/test_user.py

"""
Endpoint tests for /api/auth routes.

All job-layer functions are mocked — these tests validate HTTP contract:
status codes, response shape, cookie behaviour, and error mapping.

Fixtures expected from conftest.py (session scope):
- client: httpx.AsyncClient pointed at the FastAPI app
"""

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient

from app.core.jobs.user import (
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    AccountBannedError,
    InvalidTokenError,
    TokenExpiredError,
    StripeServiceError,
)

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

REGISTER_PAYLOAD = {"email": "test@example.com", "password": "password123", "name": "Test User"}
LOGIN_PAYLOAD = {"email": "test@example.com", "password": "password123"}

MOCK_USER = {
    "id": "00000000-0000-0000-0000-000000000001",
    "email": "test@example.com",
    "name": "Test User",
    "plan": "free",
    "subscription_status": "active",
    "created_at": "2026-01-01T00:00:00+00:00",
}
MOCK_API_KEY = {
    "id": 1,
    "name": "Default",
    "key": "dk_testkey123",
    "is_active": True,
    "created_at": "2026-01-01T00:00:00+00:00",
}
MOCK_TOKEN = "mock.jwt.token"


# ---------------------------------------------------------------------------
# POST /api/auth/register
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    with patch(
        "app.api.routes.user.register_user",
        new=AsyncMock(return_value={"user": MOCK_USER, "api_key": MOCK_API_KEY, "token": MOCK_TOKEN}),
    ):
        response = await client.post("/api/auth/register", json=REGISTER_PAYLOAD)

    assert response.status_code == 201
    data = response.json()
    assert data["user"]["email"] == "test@example.com"
    assert "apiKey" in data
    assert data["apiKey"]["key"] == "dk_testkey123"
    assert "access_token" in response.cookies


@pytest.mark.asyncio
async def test_register_email_conflict(client: AsyncClient):
    with patch(
        "app.api.routes.user.register_user",
        new=AsyncMock(side_effect=EmailAlreadyExistsError),
    ):
        response = await client.post("/api/auth/register", json=REGISTER_PAYLOAD)

    assert response.status_code == 409
    assert "already registered" in response.json()["detail"]


@pytest.mark.asyncio
async def test_register_stripe_error(client: AsyncClient):
    with patch(
        "app.api.routes.user.register_user",
        new=AsyncMock(side_effect=StripeServiceError),
    ):
        response = await client.post("/api/auth/register", json=REGISTER_PAYLOAD)

    assert response.status_code == 502


@pytest.mark.asyncio
async def test_register_validation_error(client: AsyncClient):
    response = await client.post("/api/auth/register", json={"email": "bad", "password": "short"})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    with patch(
        "app.api.routes.user.login_user",
        new=AsyncMock(return_value={"user": MOCK_USER, "token": MOCK_TOKEN}),
    ):
        response = await client.post("/api/auth/login", json=LOGIN_PAYLOAD)

    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == "test@example.com"
    assert "access_token" in response.cookies


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    with patch(
        "app.api.routes.user.login_user",
        new=AsyncMock(side_effect=InvalidCredentialsError),
    ):
        response = await client.post("/api/auth/login", json=LOGIN_PAYLOAD)

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_banned(client: AsyncClient):
    with patch(
        "app.api.routes.user.login_user",
        new=AsyncMock(side_effect=AccountBannedError),
    ):
        response = await client.post("/api/auth/login", json=LOGIN_PAYLOAD)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_login_validation_error(client: AsyncClient):
    response = await client.post("/api/auth/login", json={})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/auth/logout
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_logout_clears_cookie(client: AsyncClient):
    response = await client.post("/api/auth/logout")
    assert response.status_code == 200
    assert response.json()["message"] == "Logged out"
    # Cookie should be cleared (max_age=0 sets it to empty)
    set_cookie = response.headers.get("set-cookie", "")
    assert "access_token" in set_cookie
    assert "Max-Age=0" in set_cookie


# ---------------------------------------------------------------------------
# POST /api/auth/forgot-password
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_forgot_password_always_200(client: AsyncClient):
    with patch(
        "app.api.routes.user.request_password_reset",
        new=AsyncMock(return_value=None),
    ):
        response = await client.post("/api/auth/forgot-password", json={"email": "any@example.com"})

    assert response.status_code == 200
    assert "reset link" in response.json()["message"]


@pytest.mark.asyncio
async def test_forgot_password_invalid_email(client: AsyncClient):
    response = await client.post("/api/auth/forgot-password", json={"email": "not-an-email"})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/auth/reset-password
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reset_password_success(client: AsyncClient):
    with patch(
        "app.api.routes.user.reset_password",
        new=AsyncMock(return_value=None),
    ):
        response = await client.post(
            "/api/auth/reset-password",
            json={"token": "raw_token_abc", "newPassword": "newpassword123"},
        )

    assert response.status_code == 200
    assert response.json()["message"] == "Password updated"


@pytest.mark.asyncio
async def test_reset_password_invalid_token(client: AsyncClient):
    with patch(
        "app.api.routes.user.reset_password",
        new=AsyncMock(side_effect=InvalidTokenError("Invalid or unknown reset token")),
    ):
        response = await client.post(
            "/api/auth/reset-password",
            json={"token": "bad_token", "newPassword": "newpassword123"},
        )

    assert response.status_code == 400
    assert "Invalid" in response.json()["detail"]


@pytest.mark.asyncio
async def test_reset_password_expired_token(client: AsyncClient):
    with patch(
        "app.api.routes.user.reset_password",
        new=AsyncMock(side_effect=TokenExpiredError("Reset token has expired")),
    ):
        response = await client.post(
            "/api/auth/reset-password",
            json={"token": "expired_token", "newPassword": "newpassword123"},
        )

    assert response.status_code == 400
    assert "expired" in response.json()["detail"]


@pytest.mark.asyncio
async def test_reset_password_validation_error(client: AsyncClient):
    # Missing token field
    response = await client.post("/api/auth/reset-password", json={"newPassword": "newpassword123"})
    assert response.status_code == 422
