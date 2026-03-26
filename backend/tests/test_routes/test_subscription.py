"""Endpoint tests for /api/billing/* and /api/webhooks/stripe.

These tests use httpx.AsyncClient against a mounted FastAPI app with all
external dependencies (Stripe API, DB) mocked at the job/crud layer.

Run with:
    pytest tests/test_routes/test_subscription.py -v
"""

import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from fastapi import FastAPI
from app.api.routes.subscription import billing_router, webhook_router, get_current_user
from types import SimpleNamespace


# ---------------------------------------------------------------------------
# Test app setup
# ---------------------------------------------------------------------------

def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(billing_router)
    app.include_router(webhook_router)
    return app


def _override_auth(user_id: str = "user-123", email: str = "test@example.com"):
    async def _mock_user():
        return SimpleNamespace(user_id=user_id, email=email)
    return _mock_user


# ---------------------------------------------------------------------------
# POST /api/billing/checkout
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_checkout_returns_url():
    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    with patch(
        "app.api.routes.subscription.create_checkout_session",
        new=AsyncMock(return_value={"checkout_url": "https://checkout.stripe.com/pay/cs_test_123"}),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/billing/checkout",
                json={"priceKey": "starter_monthly", "quantity": 1},
            )

    assert response.status_code == 200
    data = response.json()
    assert data["checkoutUrl"] == "https://checkout.stripe.com/pay/cs_test_123"


@pytest.mark.asyncio
async def test_checkout_validation_error():
    """Missing required fields → 422."""
    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/billing/checkout", json={})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_checkout_invalid_quantity():
    """quantity=0 violates ge=1 → 422."""
    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/billing/checkout",
            json={"priceKey": "starter_monthly", "quantity": 0},
        )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_checkout_value_error_returns_400():
    """Job raises ValueError (e.g. agency < 3 seats) → 400."""
    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    with patch(
        "app.api.routes.subscription.create_checkout_session",
        new=AsyncMock(side_effect=ValueError("Agency plan requires min 3 seats")),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/billing/checkout",
                json={"priceKey": "agency_monthly", "quantity": 2},
            )

    assert response.status_code == 400
    assert "3 seats" in response.json()["detail"]


@pytest.mark.asyncio
async def test_checkout_stripe_error_returns_502():
    """Stripe API failure → 502."""
    import stripe as stripe_lib

    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    with patch(
        "app.api.routes.subscription.create_checkout_session",
        new=AsyncMock(side_effect=stripe_lib.error.StripeError("API down")),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/billing/checkout",
                json={"priceKey": "pro_monthly", "quantity": 1},
            )

    assert response.status_code == 502


@pytest.mark.asyncio
async def test_checkout_no_auth_returns_401():
    """No cookie → 401."""
    app = _make_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/billing/checkout",
            json={"priceKey": "starter_monthly", "quantity": 1},
        )

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/billing/portal
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_portal_returns_url():
    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    fake_user = {"stripe_customer_id": "cus_test_abc"}

    with (
        patch("app.api.routes.subscription.get_user_by_id", new=AsyncMock(return_value=fake_user)),
        patch(
            "app.api.routes.subscription.create_portal_session",
            new=AsyncMock(return_value={"portal_url": "https://billing.stripe.com/session/test_123"}),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/billing/portal",
                json={"returnUrl": "https://app.example.com/billing"},
            )

    assert response.status_code == 200
    assert response.json()["portalUrl"].startswith("https://billing.stripe.com")


@pytest.mark.asyncio
async def test_portal_missing_return_url_returns_422():
    """Empty returnUrl → 422."""
    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/billing/portal", json={"returnUrl": ""})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_portal_no_stripe_customer_returns_400():
    """User without stripe_customer_id → 400."""
    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    fake_user = {"stripe_customer_id": None}

    with patch("app.api.routes.subscription.get_user_by_id", new=AsyncMock(return_value=fake_user)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/billing/portal",
                json={"returnUrl": "https://app.example.com/billing"},
            )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_portal_stripe_error_returns_502():
    import stripe as stripe_lib

    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    fake_user = {"stripe_customer_id": "cus_test"}

    with (
        patch("app.api.routes.subscription.get_user_by_id", new=AsyncMock(return_value=fake_user)),
        patch(
            "app.api.routes.subscription.create_portal_session",
            new=AsyncMock(side_effect=stripe_lib.error.StripeError("API down")),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/billing/portal",
                json={"returnUrl": "https://app.example.com/billing"},
            )

    assert response.status_code == 502


# ---------------------------------------------------------------------------
# GET /api/billing/status
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_billing_status_active_subscription():
    from datetime import datetime, timezone, timedelta

    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    period_end = datetime.now(timezone.utc) + timedelta(days=20)
    fake_user = {
        "plan": "pro",
        "subscription_status": "active",
        "current_period_end": period_end,
        "cancel_at_period_end": False,
    }

    with patch("app.api.routes.subscription.get_user_by_id", new=AsyncMock(return_value=fake_user)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/billing/status")

    assert response.status_code == 200
    data = response.json()
    assert data["plan"] == "pro"
    assert data["subscriptionStatus"] == "active"
    assert data["cancelAtPeriodEnd"] is False
    assert data["trialDaysRemaining"] is None


@pytest.mark.asyncio
async def test_billing_status_trialing_computes_days():
    from datetime import datetime, timezone, timedelta

    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    period_end = datetime.now(timezone.utc) + timedelta(days=10)
    fake_user = {
        "plan": "starter",
        "subscription_status": "trialing",
        "current_period_end": period_end,
        "cancel_at_period_end": False,
    }

    with patch("app.api.routes.subscription.get_user_by_id", new=AsyncMock(return_value=fake_user)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/billing/status")

    assert response.status_code == 200
    data = response.json()
    assert data["subscriptionStatus"] == "trialing"
    assert data["trialDaysRemaining"] is not None
    assert data["trialDaysRemaining"] >= 9  # allow 1-day tolerance


@pytest.mark.asyncio
async def test_billing_status_free_plan():
    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    fake_user = {
        "plan": "free",
        "subscription_status": None,
        "current_period_end": None,
        "cancel_at_period_end": False,
    }

    with patch("app.api.routes.subscription.get_user_by_id", new=AsyncMock(return_value=fake_user)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/billing/status")

    assert response.status_code == 200
    data = response.json()
    assert data["plan"] == "free"
    assert data["subscriptionStatus"] is None
    assert data["currentPeriodEnd"] is None
    assert data["trialDaysRemaining"] is None


@pytest.mark.asyncio
async def test_billing_status_user_not_found_returns_404():
    app = _make_app()
    app.dependency_overrides[get_current_user] = _override_auth()

    with patch("app.api.routes.subscription.get_user_by_id", new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/billing/status")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_billing_status_no_auth_returns_401():
    app = _make_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/billing/status")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/webhooks/stripe
# ---------------------------------------------------------------------------

def _make_fake_event(event_type: str, event_id: str | None = None) -> MagicMock:
    event = MagicMock()
    event.__getitem__ = lambda self, key: {"type": event_type, "id": event_id or f"evt_{uuid.uuid4().hex}"}[key]
    event["type"] = event_type
    event["id"] = event_id or f"evt_{uuid.uuid4().hex}"
    return event


def _stripe_event_dict(event_type: str, event_id: str | None = None) -> dict:
    return {"type": event_type, "id": event_id or f"evt_{uuid.uuid4().hex}"}


@pytest.mark.asyncio
async def test_webhook_invalid_signature_returns_400():
    import stripe as stripe_lib

    app = _make_app()

    with patch(
        "app.api.routes.subscription.stripe.Webhook.construct_event",
        side_effect=stripe_lib.error.SignatureVerificationError("bad sig", "sig_header"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/stripe",
                content=b"{}",
                headers={"stripe-signature": "bad"},
            )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_webhook_checkout_completed_dispatches():
    """checkout.session.completed → handle_checkout_completed called once."""
    app = _make_app()

    fake_event = {"type": "checkout.session.completed", "id": "evt_test_1"}
    handler_mock = AsyncMock()

    with (
        patch("app.api.routes.subscription.stripe.Webhook.construct_event", return_value=fake_event),
        patch("app.api.routes.subscription.handle_checkout_completed", new=handler_mock),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/stripe",
                content=b"{}",
                headers={"stripe-signature": "t=1,v1=sig"},
            )

    assert response.status_code == 200
    assert response.json()["received"] is True
    handler_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_webhook_invoice_paid_dispatches():
    app = _make_app()

    fake_event = {"type": "invoice.paid", "id": "evt_test_2"}
    handler_mock = AsyncMock()

    with (
        patch("app.api.routes.subscription.stripe.Webhook.construct_event", return_value=fake_event),
        patch("app.api.routes.subscription.handle_invoice_paid", new=handler_mock),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/stripe",
                content=b"{}",
                headers={"stripe-signature": "t=1,v1=sig"},
            )

    assert response.status_code == 200
    handler_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_webhook_unknown_event_returns_200():
    """Unknown event type → 200 silently (Stripe best practice)."""
    app = _make_app()

    fake_event = {"type": "unknown.event.type", "id": "evt_test_3"}

    with patch("app.api.routes.subscription.stripe.Webhook.construct_event", return_value=fake_event):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/stripe",
                content=b"{}",
                headers={"stripe-signature": "t=1,v1=sig"},
            )

    assert response.status_code == 200
    assert response.json()["received"] is True


@pytest.mark.asyncio
async def test_webhook_trial_will_end_returns_200_no_handler():
    """customer.subscription.trial_will_end → 200, no handler called."""
    app = _make_app()

    fake_event = {"type": "customer.subscription.trial_will_end", "id": "evt_test_4"}

    with patch("app.api.routes.subscription.stripe.Webhook.construct_event", return_value=fake_event):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/stripe",
                content=b"{}",
                headers={"stripe-signature": "t=1,v1=sig"},
            )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_webhook_handler_exception_returns_500():
    """Handler raises → 500 (Stripe will retry)."""
    app = _make_app()

    fake_event = {"type": "invoice.payment_failed", "id": "evt_test_5"}

    with (
        patch("app.api.routes.subscription.stripe.Webhook.construct_event", return_value=fake_event),
        patch(
            "app.api.routes.subscription.handle_invoice_payment_failed",
            new=AsyncMock(side_effect=RuntimeError("DB down")),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/stripe",
                content=b"{}",
                headers={"stripe-signature": "t=1,v1=sig"},
            )

    assert response.status_code == 500
