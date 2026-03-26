#!/usr/bin/env python3
# app/api/middleware/auth.py

"""
Single auth + usage middleware for all plugin routes.

verify_api_key(feature):
    Factory that returns a FastAPI dependency.
    In one pass: validates API key, checks subscription, checks quota.
    Returns SimpleNamespace{user_id, api_key_id, plan, seat_count}.

Usage:
    @router.post("/transcription")
    async def transcribe(auth=Depends(verify_api_key("transcription"))):
        # ... do work ...
        await track_usage(auth.user_id, auth.api_key_id, "transcription")

    @router.post("/upload")
    async def upload(auth=Depends(verify_api_key())):
        # No feature = no quota check, just auth
"""

from types import SimpleNamespace
from fastapi import Header, HTTPException
from app.database.crud.api_key import get_api_key_by_key
from app.database.crud.user import get_user_by_id
from app.database.crud.usage import count_feature_usage
from app.core.utils.plans import get_access_level, get_plan_limits
from config.config import settings

_FEATURE_TO_LIMIT_KEY = {
    "transcription": "transcriptions",
    "correction": "corrections",
    "derushing": "derushages",
    "normalization": "normalizations",
    "color_corrections": "color_corrections",
}


def verify_api_key(feature: str | None = None):
    """Factory: returns a dependency that validates key + subscription + quota.

    Args:
        feature: if provided, also checks monthly quota for this feature.
                 None = auth only (upload, download).
    """

    async def _verify(x_api_key: str = Header(alias="X-API-Key", default=None)) -> SimpleNamespace:
        # 1. Key present?
        if not x_api_key:
            raise HTTPException(status_code=403, detail="Missing API key")

        # 2. Key valid + active?
        key_row = await get_api_key_by_key(x_api_key)
        if not key_row:
            raise HTTPException(
                status_code=403,
                detail={"error": "Invalid API key", "code": "INVALID_KEY"},
            )

        # 3. User exists?
        user = await get_user_by_id(str(key_row["user_id"]))
        if not user:
            raise HTTPException(
                status_code=403,
                detail={"error": "User not found", "code": "INVALID_KEY"},
            )

        # 4. Subscription active?
        access = get_access_level(
            user["subscription_status"],
            user.get("payment_failed_at"),
        )
        if access in ("blocked", "limited"):
            code = "PAYMENT_FAILED" if user["subscription_status"] == "past_due" else "NO_SUBSCRIPTION"
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "No active subscription",
                    "code": code,
                    "dashboardUrl": settings.dashboard_url,
                },
            )

        ctx = SimpleNamespace(
            user_id=str(user["id"]),
            api_key_id=key_row["id"],
            plan=user["plan"],
            seat_count=user.get("seat_count", 1) or 1,
        )

        # 5. Quota check (only if feature specified)
        if feature:
            limits = get_plan_limits(ctx.plan, ctx.seat_count)
            limit_key = _FEATURE_TO_LIMIT_KEY.get(feature, f"{feature}s")
            limit = limits.get(limit_key, 0)
            used = await count_feature_usage(ctx.user_id, feature)

            if used >= limit:
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": f"Monthly limit reached: {used}/{limit} {feature}",
                        "code": "LIMIT_REACHED",
                        "feature": feature,
                        "used": used,
                        "limit": limit,
                        "dashboardUrl": settings.dashboard_url,
                    },
                )

        return ctx

    return _verify
