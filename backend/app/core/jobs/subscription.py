import logging
from datetime import datetime, timezone
from pathlib import Path

import stripe

from app.database.crud.user import (
    get_user_by_id,
    get_user_by_stripe_subscription_id,
    update_user_subscription,
)
from app.database.crud.usage import record_stripe_event
from app.database.crud.team import create_team
from app.core.utils.plans import resolve_plan_from_price
from config.config import settings

logger = logging.getLogger(__name__)

stripe.api_key = settings.stripe_secret_key

# Maps plan key (from request) -> Stripe price ID
PRICE_MAP: dict[str, str] = {
    "starter_monthly": settings.stripe_price_starter_monthly,
    "starter_annual":  settings.stripe_price_starter_annual,
    "pro_monthly":     settings.stripe_price_pro_monthly,
    "pro_annual":      settings.stripe_price_pro_annual,
    "agency_monthly":  settings.stripe_price_agency_monthly,
}

AGENCY_MIN_SEATS = 3
TRIAL_PERIOD_DAYS = 14


def _load_student_emails() -> set[str]:
    """Load student emails from file + env var."""
    emails: set[str] = set()
    # From file
    student_file = Path(__file__).resolve().parents[3] / "student-list.txt"
    if student_file.exists():
        for line in student_file.read_text().splitlines():
            line = line.strip().lower()
            if line and "@" in line:
                emails.add(line)
    # From env (comma-separated, for quick additions)
    raw = settings.student_emails.strip()
    if raw:
        for e in raw.split(","):
            e = e.strip().lower()
            if e:
                emails.add(e)
    return emails


# Cache at module load
_STUDENT_EMAILS = _load_student_emails()
logger.info("Loaded %d student emails", len(_STUDENT_EMAILS))


def _is_student(email: str) -> bool:
    return email.strip().lower() in _STUDENT_EMAILS


# ---------------------------------------------------------------------------
# Helpers for Stripe API v2025-06-30.basil compatibility
# ---------------------------------------------------------------------------

def _get_subscription_price_id(subscription) -> str:
    """Extract price ID from subscription. Uses dict access to avoid
    collision with Python dict.items() on StripeObject."""
    return subscription["items"]["data"][0]["price"]["id"]


def _get_subscription_period_end(subscription) -> datetime | None:
    """Get the current period end from a subscription.
    In Stripe API v2025-06-30, current_period_end is removed from Subscription.
    We retrieve it from the latest invoice line item period.end."""
    latest_invoice_id = subscription.get("latest_invoice")
    if not latest_invoice_id:
        return None
    try:
        invoice = stripe.Invoice.retrieve(latest_invoice_id, expand=["lines.data"])
        lines = invoice.get("lines", {}).get("data", [])
        if lines:
            period_end = lines[0].get("period", {}).get("end")
            if period_end:
                return datetime.fromtimestamp(period_end, tz=timezone.utc)
    except Exception:
        logger.warning("_get_subscription_period_end: failed to retrieve invoice %s", latest_invoice_id)
    return None


def _get_invoice_subscription_id(invoice) -> str | None:
    """Extract subscription ID from invoice.
    In Stripe API v2025-06-30, invoice.subscription moved to
    invoice.parent.subscription_details.subscription."""
    # New API path
    parent = invoice.get("parent")
    if parent:
        sub_details = parent.get("subscription_details")
        if sub_details:
            return sub_details.get("subscription")
    # Fallback for older API versions
    return invoice.get("subscription")


# ---------------------------------------------------------------------------
# Checkout
# ---------------------------------------------------------------------------

async def create_checkout_session(
    user_id: str,
    plan: str,
    quantity: int = 1,
    success_url: str = "",
    cancel_url: str = "",
) -> dict:
    """Build a Stripe Checkout Session URL for the given user and plan.

    Returns {"checkout_url": session.url}.
    Raises ValueError for unknown plan, missing Stripe customer, or agency seat violation.
    Raises stripe.error.StripeError on Stripe API failure.
    """
    if not success_url:
        success_url = f"{settings.dashboard_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
    if not cancel_url:
        cancel_url = f"{settings.dashboard_url}/billing/cancel"

    user = await get_user_by_id(user_id)
    if user is None:
        raise ValueError(f"User {user_id} not found")

    if not user.get("stripe_customer_id"):
        raise ValueError("No Stripe customer")

    # If user already has a subscription, they should use the Portal to change plans
    if user.get("stripe_subscription_id"):
        raise ValueError("Tu as déjà un abonnement actif. Utilise 'Gérer mon abonnement' pour changer de plan.")

    # Student override: force Pro monthly + coupon, no trial
    user_email = user.get("email", "")
    is_student = _is_student(user_email)

    if is_student:
        price_id = settings.stripe_price_pro_monthly
        logger.info("Student detected (%s) — forcing Pro monthly + coupon %s", user_email, settings.student_coupon_id)
    else:
        price_id = PRICE_MAP.get(plan)
        if price_id is None:
            raise ValueError(f"Unknown plan: {plan}")

    if "agency" in plan and not is_student and quantity < AGENCY_MIN_SEATS:
        raise ValueError("Agency plan requires min 3 seats")

    # Build subscription_data
    subscription_data: dict = {"metadata": {"user_id": str(user_id)}}

    if is_student:
        # No trial for students — they get 6 months free via coupon
        pass
    else:
        # Only grant trial if user never had one before
        had_trial = user.get("had_trial", False)
        if not had_trial:
            subscription_data["trial_period_days"] = TRIAL_PERIOD_DAYS

    # Build session params
    session_params: dict = {
        "customer": user["stripe_customer_id"],
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": quantity}],
        "subscription_data": subscription_data,
        "metadata": {"user_id": str(user_id)},
        "success_url": success_url,
        "cancel_url": cancel_url,
    }

    # Apply student coupon
    if is_student:
        session_params["discounts"] = [{"coupon": settings.student_coupon_id}]

    session = stripe.checkout.Session.create(**session_params)
    return {"checkout_url": session.url}


# ---------------------------------------------------------------------------
# Webhook handlers
# ---------------------------------------------------------------------------

async def handle_checkout_completed(payload: bytes, stripe_signature: str) -> None:
    """Process checkout.session.completed webhook with idempotency guard."""
    event = stripe.Webhook.construct_event(
        payload, stripe_signature, settings.stripe_webhook_secret
    )
    if event.type != "checkout.session.completed":
        return

    is_new = await record_stripe_event(event.id, event.type)
    if not is_new:
        return

    session = event.data.object
    user_id = session.metadata.get("user_id")
    if not user_id:
        logger.warning("handle_checkout_completed: missing user_id in metadata (event_id=%s)", event.id)
        return

    subscription = stripe.Subscription.retrieve(session.subscription)
    price_id = _get_subscription_price_id(subscription)
    plan = resolve_plan_from_price(price_id, settings)
    period_end = _get_subscription_period_end(subscription)

    fields = {
        "plan": plan,
        "subscription_status": subscription.status,
        "stripe_subscription_id": subscription.id,
        "seat_count": subscription.quantity,
        "had_trial": True,  # Mark that this user has used their trial
    }
    if period_end:
        fields["current_period_end"] = period_end

    await update_user_subscription(user_id, fields)

    if plan == "agency":
        await create_team(owner_id=user_id, seat_count=subscription.quantity)


async def handle_invoice_paid(payload: bytes, stripe_signature: str) -> None:
    """Process invoice.paid webhook -- refreshes period_end and clears payment_failed_at."""
    event = stripe.Webhook.construct_event(
        payload, stripe_signature, settings.stripe_webhook_secret
    )
    if event.type != "invoice.paid":
        return

    is_new = await record_stripe_event(event.id, event.type)
    if not is_new:
        return

    invoice = event.data.object
    subscription_id = _get_invoice_subscription_id(invoice)
    if not subscription_id:
        logger.warning("handle_invoice_paid: no subscription_id in invoice %s", invoice.id)
        return

    subscription = stripe.Subscription.retrieve(subscription_id)

    user = await get_user_by_stripe_subscription_id(subscription_id)
    if user is None:
        logger.warning("handle_invoice_paid: user not found for subscription %s", subscription_id)
        return

    period_end = _get_subscription_period_end(subscription)
    update_fields = {
        "subscription_status": subscription.status,
        "payment_failed_at": None,
    }
    if period_end:
        update_fields["current_period_end"] = period_end

    await update_user_subscription(user["id"], update_fields)


async def handle_invoice_payment_failed(payload: bytes, stripe_signature: str) -> None:
    """Process invoice.payment_failed webhook -- sets past_due + payment_failed_at."""
    event = stripe.Webhook.construct_event(
        payload, stripe_signature, settings.stripe_webhook_secret
    )
    if event.type != "invoice.payment_failed":
        return

    is_new = await record_stripe_event(event.id, event.type)
    if not is_new:
        return

    invoice = event.data.object
    subscription_id = _get_invoice_subscription_id(invoice)
    if not subscription_id:
        logger.warning("handle_invoice_payment_failed: no subscription_id in invoice %s", invoice.id)
        return

    user = await get_user_by_stripe_subscription_id(subscription_id)
    if user is None:
        logger.warning("handle_invoice_payment_failed: user not found for subscription %s", subscription_id)
        return

    await update_user_subscription(user["id"], {
        "subscription_status": "past_due",
        "payment_failed_at": datetime.now(tz=timezone.utc),
    })


async def handle_subscription_updated(payload: bytes, stripe_signature: str) -> None:
    """Process customer.subscription.updated webhook -- syncs plan, status, seats."""
    event = stripe.Webhook.construct_event(
        payload, stripe_signature, settings.stripe_webhook_secret
    )
    if event.type != "customer.subscription.updated":
        return

    is_new = await record_stripe_event(event.id, event.type)
    if not is_new:
        return

    subscription = event.data.object

    try:
        price_id = _get_subscription_price_id(subscription)
        plan = resolve_plan_from_price(price_id, settings)
    except Exception:
        logger.error("handle_subscription_updated: unknown price_id for subscription %s", subscription.id)
        return

    user = await get_user_by_stripe_subscription_id(subscription.id)
    if user is None:
        logger.warning("handle_subscription_updated: user not found for subscription %s", subscription.id)
        return

    # Retrieve the full subscription to get period_end from latest invoice
    full_sub = stripe.Subscription.retrieve(subscription.id)
    period_end = _get_subscription_period_end(full_sub)

    update_fields = {
        "plan": plan,
        "subscription_status": subscription.status,
        "cancel_at_period_end": subscription.cancel_at_period_end,
        "seat_count": subscription.quantity,
    }
    if period_end:
        update_fields["current_period_end"] = period_end

    await update_user_subscription(user["id"], update_fields)


async def handle_subscription_deleted(payload: bytes, stripe_signature: str) -> None:
    """Process customer.subscription.deleted webhook -- resets user to free plan."""
    event = stripe.Webhook.construct_event(
        payload, stripe_signature, settings.stripe_webhook_secret
    )
    if event.type != "customer.subscription.deleted":
        return

    is_new = await record_stripe_event(event.id, event.type)
    if not is_new:
        return

    subscription = event.data.object

    user = await get_user_by_stripe_subscription_id(subscription.id)
    if user is None:
        logger.warning("handle_subscription_deleted: user not found for subscription %s", subscription.id)
        return

    await update_user_subscription(user["id"], {
        "plan": "free",
        "subscription_status": "cancelled",
        "stripe_subscription_id": None,
        "cancel_at_period_end": False,
    })


# ---------------------------------------------------------------------------
# Portal
# ---------------------------------------------------------------------------

async def create_portal_session(
    user_stripe_customer_id: str,
    return_url: str = "",
) -> dict:
    """Build a Stripe Billing Portal Session URL.

    Returns {"portal_url": session.url}.
    Raises stripe.error.StripeError on failure.
    """
    session = stripe.billing_portal.Session.create(
        customer=user_stripe_customer_id,
        return_url=return_url,
    )
    return {"portal_url": session.url}
