from datetime import datetime, timezone
from typing import Any

# Base limits per plan (flat values, agency multiplied by seat_count)
_PLAN_LIMITS: dict[str, dict[str, int]] = {
    "free":    {"transcriptions": 10, "corrections": 10, "derushages": 10, "normalizations": 10, "color_corrections": 10},
    "trial":   {"transcriptions": 10, "corrections": 10, "derushages": 10, "normalizations": 10, "color_corrections": 10},
    "starter": {"transcriptions": 15, "corrections": 15, "derushages": 15, "normalizations": 15, "color_corrections": 15},
    "pro":     {"transcriptions": 60, "corrections": 60, "derushages": 60, "normalizations": 60, "color_corrections": 60},
    "agency":  {"transcriptions": 60, "corrections": 60, "derushages": 60, "normalizations": 60, "color_corrections": 60},
    "unlimited": {"transcriptions": 999999, "corrections": 999999, "derushages": 999999, "normalizations": 999999, "color_corrections": 999999},
}

_ZERO_LIMITS: dict[str, int] = {
    "transcriptions": 0, "corrections": 0, "derushages": 0, "normalizations": 0, "color_corrections": 0,
}

_GRACE_PERIOD_DAYS = 7


def get_plan_limits(plan: str, seat_count: int = 1) -> dict[str, int]:
    """Return monthly operation limits for a plan.

    For agency, each limit is multiplied by seat_count (shared pool).
    Unknown plan returns all zeros.
    """
    base = _PLAN_LIMITS.get(plan)
    if base is None:
        return dict(_ZERO_LIMITS)
    if plan == "agency" and seat_count > 1:
        return {k: v * seat_count for k, v in base.items()}
    return dict(base)


def get_access_level(
    subscription_status: str | None,
    payment_failed_at: datetime | None,
) -> str:
    """Return access level based on subscription status.

    Returns:
        "full"    — active or trialing, or past_due within grace period
        "limited" — past_due beyond grace period
        "blocked" — cancelled, no subscription, or unknown status
    """
    if subscription_status in ("active", "trialing"):
        return "full"

    if subscription_status == "past_due":
        if payment_failed_at is None:
            return "full"
        now = datetime.now(tz=timezone.utc)
        # Ensure payment_failed_at is timezone-aware for comparison
        failed_at = payment_failed_at
        if failed_at.tzinfo is None:
            failed_at = failed_at.replace(tzinfo=timezone.utc)
        days_elapsed = (now - failed_at).days
        return "full" if days_elapsed < _GRACE_PERIOD_DAYS else "limited"

    return "blocked"


def get_all_plans(settings: Any) -> list[dict]:
    """Return the full plans list for GET /api/plans.

    Injects live Stripe price IDs from settings into each plan.
    """
    return [
        {
            "id": "starter",
            "name": "Starter",
            "description": "Pour les editeurs individuels",
            "prices": {
                "monthly": {
                    "amount": 1400,
                    "currency": "eur",
                    "display": "14",
                    "stripe_price_id": settings.stripe_price_starter_monthly,
                    "interval": "month",
                    "per_seat": False,
                },
                "annual": {
                    "amount": 10800,
                    "currency": "eur",
                    "display": "9",
                    "display_yearly": "108",
                    "stripe_price_id": settings.stripe_price_starter_annual,
                    "interval": "year",
                    "per_seat": False,
                },
            },
            "limits": _PLAN_LIMITS["starter"],
            "limits_note": None,
            "features": [
                "Transcription IA",
                "Correction orthographique",
                "Suppression des silences",
                "Normalisation audio",
                "Correction colorimétrique",
            ],
            "highlighted": False,
            "min_seats": None,
            "trial_days": 14,
        },
        {
            "id": "pro",
            "name": "Pro",
            "description": "Pour les editeurs actifs",
            "prices": {
                "monthly": {
                    "amount": 3900,
                    "currency": "eur",
                    "display": "39",
                    "stripe_price_id": settings.stripe_price_pro_monthly,
                    "interval": "month",
                    "per_seat": False,
                },
                "annual": {
                    "amount": 32400,
                    "currency": "eur",
                    "display": "27",
                    "display_yearly": "324",
                    "stripe_price_id": settings.stripe_price_pro_annual,
                    "interval": "year",
                    "per_seat": False,
                },
            },
            "limits": _PLAN_LIMITS["pro"],
            "limits_note": None,
            "features": [
                "Transcription IA",
                "Correction orthographique",
                "Suppression des silences",
                "Normalisation audio",
                "Correction colorimétrique",
                "Support prioritaire",
            ],
            "highlighted": True,
            "min_seats": None,
            "trial_days": 14,
        },
        {
            "id": "agency",
            "name": "Agency",
            "description": "Pour les equipes",
            "prices": {
                "monthly": {
                    "amount": 2900,
                    "currency": "eur",
                    "display": "29",
                    "stripe_price_id": settings.stripe_price_agency_monthly,
                    "interval": "month",
                    "per_seat": True,
                },
            },
            "limits": _PLAN_LIMITS["agency"],
            "limits_note": "par siege",
            "features": [
                "Transcription IA",
                "Correction orthographique",
                "Suppression des silences",
                "Normalisation audio",
                "Gestion d'equipe",
                "Support prioritaire",
            ],
            "highlighted": False,
            "min_seats": 3,
            "trial_days": 14,
        },
    ]


def resolve_plan_from_price(price_id: str, settings: Any) -> str:
    """Reverse-map a Stripe Price ID to a plan name.

    Returns "free" if the price_id is not recognised.
    """
    mapping: dict[str, str] = {
        settings.stripe_price_starter_monthly: "starter",
        settings.stripe_price_starter_annual: "starter",
        settings.stripe_price_pro_monthly: "pro",
        settings.stripe_price_pro_annual: "pro",
        settings.stripe_price_agency_monthly: "agency",
    }
    return mapping.get(price_id, "free")
