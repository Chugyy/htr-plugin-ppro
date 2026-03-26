#!/usr/bin/env python3
# app/api/routes/subscription.py

import logging
from datetime import datetime, timezone
from types import SimpleNamespace

import stripe

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request

from config.config import settings
from app.api.models.subscription import (
    CheckoutRequest,
    CheckoutResponse,
    PortalRequest,
    PortalResponse,
    BillingStatusResponse,
    WebhookAckResponse,
)
from app.core.jobs.subscription import (
    create_checkout_session,
    create_portal_session,
    handle_checkout_completed,
    handle_invoice_paid,
    handle_invoice_payment_failed,
    handle_subscription_updated,
    handle_subscription_deleted,
)
from app.database.crud.user import get_user_by_id
from app.core.utils.auth import decode_jwt

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Routers — separate prefixes (billing vs webhooks)
# ---------------------------------------------------------------------------

billing_router = APIRouter(prefix="/api/billing", tags=["billing"])
webhook_router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

async def get_current_user(access_token: str = Cookie(None)) -> SimpleNamespace:
    if not access_token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    payload = decode_jwt(access_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return SimpleNamespace(user_id=payload["sub"], email=payload["email"])


# ---------------------------------------------------------------------------
# Billing endpoints (JWT protected)
# ---------------------------------------------------------------------------

@billing_router.post("/checkout", response_model=CheckoutResponse)
async def checkout_endpoint(
    data: CheckoutRequest,
    current_user: SimpleNamespace = Depends(get_current_user),
):
    try:
        result = await create_checkout_session(
            user_id=str(current_user.user_id),
            plan=data.price_key,
            quantity=data.quantity,
            success_url=f"{settings.dashboard_url}/billing/success",
            cancel_url=f"{settings.dashboard_url}/billing",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except stripe.error.StripeError as exc:
        logger.error("Stripe checkout error: %s", exc)
        raise HTTPException(status_code=502, detail="Payment service unavailable")
    return CheckoutResponse(checkout_url=result["checkout_url"])


@billing_router.post("/portal", response_model=PortalResponse)
async def portal_endpoint(
    data: PortalRequest,
    current_user: SimpleNamespace = Depends(get_current_user),
):
    user = await get_user_by_id(str(current_user.user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="No Stripe customer associated with this account")

    try:
        result = await create_portal_session(
            user_stripe_customer_id=user["stripe_customer_id"],
            return_url=data.return_url,
        )
    except stripe.error.StripeError as exc:
        logger.error("Stripe portal error: %s", exc)
        raise HTTPException(status_code=502, detail="Payment service unavailable")
    return PortalResponse(portal_url=result["portal_url"])


@billing_router.get("/status", response_model=BillingStatusResponse)
async def billing_status_endpoint(
    current_user: SimpleNamespace = Depends(get_current_user),
):
    user = await get_user_by_id(str(current_user.user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    trial_days_remaining: int | None = None
    if user.get("subscription_status") == "trialing" and user.get("current_period_end"):
        delta = user["current_period_end"] - datetime.now(timezone.utc)
        trial_days_remaining = max(0, delta.days)

    return BillingStatusResponse(
        plan=user["plan"],
        subscription_status=user.get("subscription_status"),
        current_period_end=user.get("current_period_end"),
        cancel_at_period_end=user.get("cancel_at_period_end", False),
        trial_days_remaining=trial_days_remaining,
    )


# ---------------------------------------------------------------------------
# Webhook endpoint (Stripe signature — no JWT)
# ---------------------------------------------------------------------------

_HANDLERS = {
    "checkout.session.completed": handle_checkout_completed,
    "invoice.paid": handle_invoice_paid,
    "invoice.payment_failed": handle_invoice_payment_failed,
    "customer.subscription.updated": handle_subscription_updated,
    "customer.subscription.deleted": handle_subscription_deleted,
}


@webhook_router.post("/stripe", response_model=WebhookAckResponse)
async def stripe_webhook_endpoint(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    # Verify signature — return 400 on failure (Stripe will not retry 4xx)
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    event_type = event["type"]

    if event_type == "customer.subscription.trial_will_end":
        logger.info("stripe_webhook: trial_will_end received — no handler yet (event_id=%s)", event["id"])
        return WebhookAckResponse()

    handler = _HANDLERS.get(event_type)
    if handler is None:
        # Unknown event type — acknowledge silently (Stripe best practice)
        return WebhookAckResponse()

    try:
        await handler(payload, sig_header)
    except Exception:
        logger.exception("stripe_webhook: handler %s raised (event_id=%s)", event_type, event["id"])
        raise HTTPException(status_code=500, detail="Webhook handler error")

    return WebhookAckResponse()
