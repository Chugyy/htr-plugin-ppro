#!/usr/bin/env python3
# app/api/middleware/usage.py

"""
Plugin auth & usage enforcement — FastAPI dependencies (not ASGI middleware).

require_active_subscription:
    Validates X-API-Key, checks subscription status (with grace period),
    returns a SimpleNamespace{user_id, api_key_id, plan, seat_count}.

track_feature_usage(feature):
    Factory that returns a Depends-compatible callable.
    Checks monthly quota before the route runs; route must call track() after
    success (or wrap via BackgroundTasks — see docstring).
"""

from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import Depends, Header, HTTPException

from app.api.models.usage import UsageErrorCode, UsageErrorDetails, UsageErrorResponse
from app.core.utils.plans import get_access_level, get_plan_limits
from app.database.crud.api_key import get_api_key_by_key
from app.database.crud.usage import count_feature_usage, track_usage
from app.database.crud.user import get_user_by_id
from config.config import settings

_GRACE_PERIOD_DAYS = 7


def _usage_error(status: int, error: str, code: UsageErrorCode, **details_kwargs) -> HTTPException:
    body = UsageErrorResponse(
        error=error,
        code=code,
        details=UsageErrorDetails(**details_kwargs),
    )
    return HTTPException(
        status_code=status,
        detail=body.model_dump(by_alias=True),
    )


async def require_active_subscription(
    x_api_key: str = Header(alias="X-API-Key", default=None),
) -> SimpleNamespace:
    """Dependency: validate plugin API key + subscription gate.

    Returns SimpleNamespace(user_id, api_key_id, plan, seat_count).
    Raises 403 on invalid key, blocked/cancelled subscription, or expired grace period.
    """
    if not x_api_key:
        raise _usage_error(403, "Missing API key", UsageErrorCode.INVALID_KEY)

    api_key_row = await get_api_key_by_key(x_api_key)
    if not api_key_row:
        raise _usage_error(403, "Invalid or inactive API key", UsageErrorCode.INVALID_KEY)

    user = await get_user_by_id(str(api_key_row["user_id"]))
    if not user:
        raise _usage_error(403, "Invalid or inactive API key", UsageErrorCode.INVALID_KEY)

    access = get_access_level(
        subscription_status=user.get("subscription_status"),
        payment_failed_at=user.get("payment_failed_at"),
    )

    if access == "blocked":
        status_val = user.get("subscription_status")
        if status_val in ("past_due",):
            raise _usage_error(
                403,
                "Payment failed — grace period expired",
                UsageErrorCode.PAYMENT_FAILED,
                dashboard_url=settings.dashboard_url,
            )
        raise _usage_error(
            403,
            "No active subscription",
            UsageErrorCode.NO_SUBSCRIPTION,
            dashboard_url=settings.dashboard_url,
        )

    # access == "limited" is treated the same as blocked for plugin requests
    if access == "limited":
        raise _usage_error(
            403,
            "Payment failed — grace period expired",
            UsageErrorCode.PAYMENT_FAILED,
            dashboard_url=settings.dashboard_url,
        )

    return SimpleNamespace(
        user_id=api_key_row["user_id"],
        api_key_id=api_key_row["id"],
        plan=user["plan"],
        seat_count=user.get("seat_count", 1) or 1,
    )


def track_feature_usage(feature: str):
    """Factory: returns a FastAPI dependency that checks the monthly quota.

    Usage in route:
        @router.post("/audio/transcribe")
        async def transcribe(
            plugin_ctx: SimpleNamespace = Depends(require_active_subscription),
            _check: None = Depends(track_feature_usage("transcription")),
        ):
            ...
            await track_usage(plugin_ctx.user_id, plugin_ctx.api_key_id, "transcription")

    The dependency only enforces the limit check (pre-flight).
    Actual tracking (INSERT) must be called explicitly by the route after
    successful processing, so aborted requests are not counted.
    """
    # Map singular feature names (used internally) to plural limit keys
    _feature_to_limit_key = {
        "transcription": "transcriptions",
        "correction": "corrections",
        "derushing": "derushages",
        "normalization": "normalizations",
    }

    async def _check(
        plugin_ctx: SimpleNamespace = Depends(require_active_subscription),
    ) -> None:
        limits = get_plan_limits(plugin_ctx.plan, plugin_ctx.seat_count)
        limit_key = _feature_to_limit_key.get(feature, f"{feature}s")
        limit = limits.get(limit_key, 0)
        used = await count_feature_usage(plugin_ctx.user_id, feature)

        if used >= limit:
            raise _usage_error(
                429,
                f"Monthly limit reached for {feature}",
                UsageErrorCode.LIMIT_REACHED,
                feature=feature,
                used=used,
                limit=limit,
                dashboard_url=settings.dashboard_url,
            )

    return _check
