# tests/test_routes/test_usage.py

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from app.api.routes.usage import get_current_user, router as usage_router
from app.api.routes.plans import router as plans_router
from app.api.middleware.usage import require_active_subscription

# ---------------------------------------------------------------------------
# App fixtures
# ---------------------------------------------------------------------------

usage_app = FastAPI(response_model_by_alias=True)
usage_app.include_router(usage_router)

plans_app = FastAPI(response_model_by_alias=True)
plans_app.include_router(plans_router)

MOCK_USER_ID = uuid.uuid4()
MOCK_USER = SimpleNamespace(user_id=MOCK_USER_ID, email="user@example.com", plan="starter")
MOCK_PLUGIN_CTX = SimpleNamespace(
    user_id=MOCK_USER_ID,
    api_key_id=1,
    plan="starter",
    seat_count=1,
)

_MOCK_COUNTS = {
    "transcription": 3,
    "correction": 7,
    "derushing": 0,
    "normalization": 1,
}


@pytest.fixture(autouse=True)
def override_usage_auth():
    usage_app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    yield
    usage_app.dependency_overrides.clear()


@pytest.fixture
async def usage_client():
    async with AsyncClient(
        transport=ASGITransport(app=usage_app), base_url="http://test"
    ) as c:
        yield c


@pytest.fixture
async def plans_client():
    async with AsyncClient(
        transport=ASGITransport(app=plans_app), base_url="http://test"
    ) as c:
        yield c


# ---------------------------------------------------------------------------
# GET /api/usage/current
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_current_usage(usage_client: AsyncClient):
    with patch(
        "app.api.routes.usage.get_current_usage",
        new=AsyncMock(return_value=_MOCK_COUNTS),
    ):
        response = await usage_client.get("/api/usage/current")

    assert response.status_code == 200
    data = response.json()
    assert data["plan"] == "starter"
    assert "period" in data
    # period format YYYY-MM
    assert len(data["period"]) == 7
    assert data["features"]["transcription"]["used"] == 3
    assert data["features"]["transcription"]["limit"] == 15
    assert data["features"]["correction"]["used"] == 7
    assert data["features"]["derushing"]["used"] == 0
    assert data["features"]["normalization"]["used"] == 1


@pytest.mark.asyncio
async def test_get_current_usage_with_api_key_id(usage_client: AsyncClient):
    with patch(
        "app.api.routes.usage.get_current_usage",
        new=AsyncMock(return_value=_MOCK_COUNTS),
    ) as mock_crud:
        response = await usage_client.get("/api/usage/current?api_key_id=5")

    assert response.status_code == 200
    # Verify api_key_id was forwarded
    mock_crud.assert_awaited_once_with(user_id=MOCK_USER_ID, api_key_id=5)


@pytest.mark.asyncio
async def test_get_current_usage_requires_auth():
    """Without dependency override, missing cookie → 401."""
    bare_app = FastAPI(response_model_by_alias=True)
    bare_app.include_router(usage_router)

    async with AsyncClient(
        transport=ASGITransport(app=bare_app), base_url="http://test"
    ) as c:
        response = await c.get("/api/usage/current")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/plans
# ---------------------------------------------------------------------------

_MOCK_PLANS = [
    {
        "id": "starter",
        "name": "Starter",
        "description": "Pour les editeurs individuels",
        "prices": {
            "monthly": {
                "amount": 1400,
                "currency": "eur",
                "display": "14",
                "stripe_price_id": "price_starter_monthly",
                "interval": "month",
                "per_seat": False,
            },
            "annual": {
                "amount": 10800,
                "currency": "eur",
                "display": "9",
                "display_yearly": "108",
                "stripe_price_id": "price_starter_annual",
                "interval": "year",
                "per_seat": False,
            },
        },
        "limits": {"transcriptions": 15, "corrections": 15, "derushages": 15, "normalizations": 15},
        "limits_note": None,
        "features": ["Transcription IA"],
        "highlighted": False,
        "min_seats": None,
        "trial_days": 14,
    }
]


@pytest.mark.asyncio
async def test_get_plans(plans_client: AsyncClient):
    with patch("app.api.routes.plans.get_all_plans", return_value=_MOCK_PLANS):
        response = await plans_client.get("/api/plans")

    assert response.status_code == 200
    data = response.json()
    assert "plans" in data
    assert "trial" in data
    assert isinstance(data["plans"], list)
    assert len(data["plans"]) == 1
    assert data["plans"][0]["id"] == "starter"
    assert data["plans"][0]["limits"]["transcriptions"] == 15
    assert data["trial"]["days"] == 14
    assert data["trial"]["limits"]["transcriptions"] == 10


@pytest.mark.asyncio
async def test_get_plans_cache_header(plans_client: AsyncClient):
    with patch("app.api.routes.plans.get_all_plans", return_value=_MOCK_PLANS):
        response = await plans_client.get("/api/plans")

    assert response.status_code == 200
    assert response.headers.get("cache-control") == "public, max-age=3600"


@pytest.mark.asyncio
async def test_get_plans_public_no_auth(plans_client: AsyncClient):
    """Plans endpoint must be accessible without any auth header."""
    with patch("app.api.routes.plans.get_all_plans", return_value=_MOCK_PLANS):
        response = await plans_client.get("/api/plans")

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_plans_price_shape(plans_client: AsyncClient):
    with patch("app.api.routes.plans.get_all_plans", return_value=_MOCK_PLANS):
        response = await plans_client.get("/api/plans")

    plan = response.json()["plans"][0]
    monthly = plan["prices"]["monthly"]
    assert monthly["amount"] == 1400
    assert monthly["currency"] == "eur"
    assert "stripePrice_id" not in monthly  # camelCase: stripePriceId
    assert "stripePriceId" in monthly


# ---------------------------------------------------------------------------
# Middleware — require_active_subscription (unit tests)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_middleware_missing_key():
    """No X-API-Key header → 403 INVALID_KEY."""
    middleware_app = FastAPI()

    @middleware_app.get("/test")
    async def _route(ctx: SimpleNamespace = require_active_subscription):
        return {"ok": True}

    # Directly test the dependency function
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await require_active_subscription(x_api_key=None)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "INVALID_KEY"


@pytest.mark.asyncio
async def test_middleware_invalid_key():
    """Unknown key → 403 INVALID_KEY."""
    from fastapi import HTTPException
    with patch(
        "app.api.middleware.usage.get_api_key_by_key",
        new=AsyncMock(return_value=None),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await require_active_subscription(x_api_key="bad-key")

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "INVALID_KEY"


@pytest.mark.asyncio
async def test_middleware_no_subscription():
    """Cancelled subscription → 403 NO_SUBSCRIPTION."""
    from fastapi import HTTPException
    with (
        patch(
            "app.api.middleware.usage.get_api_key_by_key",
            new=AsyncMock(return_value={"id": 1, "user_id": MOCK_USER_ID}),
        ),
        patch(
            "app.api.middleware.usage.get_user_by_id",
            new=AsyncMock(return_value={
                "plan": "free",
                "subscription_status": "cancelled",
                "payment_failed_at": None,
                "seat_count": 1,
            }),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await require_active_subscription(x_api_key="valid-key")

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "NO_SUBSCRIPTION"


@pytest.mark.asyncio
async def test_middleware_payment_failed():
    """past_due beyond grace period → 403 PAYMENT_FAILED."""
    from datetime import timedelta
    from fastapi import HTTPException

    old_date = datetime(2025, 1, 1, tzinfo=timezone.utc)  # well past 7 days
    with (
        patch(
            "app.api.middleware.usage.get_api_key_by_key",
            new=AsyncMock(return_value={"id": 1, "user_id": MOCK_USER_ID}),
        ),
        patch(
            "app.api.middleware.usage.get_user_by_id",
            new=AsyncMock(return_value={
                "plan": "pro",
                "subscription_status": "past_due",
                "payment_failed_at": old_date,
                "seat_count": 1,
            }),
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await require_active_subscription(x_api_key="valid-key")

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "PAYMENT_FAILED"


@pytest.mark.asyncio
async def test_middleware_active_returns_context():
    """Active subscription → returns SimpleNamespace with expected fields."""
    with (
        patch(
            "app.api.middleware.usage.get_api_key_by_key",
            new=AsyncMock(return_value={"id": 7, "user_id": MOCK_USER_ID}),
        ),
        patch(
            "app.api.middleware.usage.get_user_by_id",
            new=AsyncMock(return_value={
                "plan": "pro",
                "subscription_status": "active",
                "payment_failed_at": None,
                "seat_count": 1,
            }),
        ),
    ):
        ctx = await require_active_subscription(x_api_key="valid-key")

    assert ctx.user_id == MOCK_USER_ID
    assert ctx.api_key_id == 7
    assert ctx.plan == "pro"
    assert ctx.seat_count == 1


# ---------------------------------------------------------------------------
# Middleware — track_feature_usage (unit tests)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_track_feature_usage_limit_reached():
    """used >= limit → 429 LIMIT_REACHED."""
    from fastapi import HTTPException
    from app.api.middleware.usage import track_feature_usage

    check_fn = track_feature_usage("transcription")

    ctx = SimpleNamespace(user_id=MOCK_USER_ID, api_key_id=1, plan="starter", seat_count=1)

    with patch(
        "app.api.middleware.usage.count_feature_usage",
        new=AsyncMock(return_value=15),  # exactly at limit for starter
    ):
        with pytest.raises(HTTPException) as exc_info:
            await check_fn(plugin_ctx=ctx)

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail["code"] == "LIMIT_REACHED"
    assert exc_info.value.detail["details"]["feature"] == "transcription"
    assert exc_info.value.detail["details"]["used"] == 15
    assert exc_info.value.detail["details"]["limit"] == 15


@pytest.mark.asyncio
async def test_track_feature_usage_within_limit():
    """used < limit → no exception."""
    from app.api.middleware.usage import track_feature_usage

    check_fn = track_feature_usage("transcription")
    ctx = SimpleNamespace(user_id=MOCK_USER_ID, api_key_id=1, plan="starter", seat_count=1)

    with patch(
        "app.api.middleware.usage.count_feature_usage",
        new=AsyncMock(return_value=5),
    ):
        # Must not raise
        await check_fn(plugin_ctx=ctx)
