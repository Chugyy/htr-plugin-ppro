#!/usr/bin/env python3
# app/api/routes/usage.py

from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query

from app.api.models.usage import FeatureUsage, UsageCurrentResponse
from app.core.utils.auth import decode_jwt
from app.core.utils.plans import get_plan_limits
from app.database.crud.usage import get_current_usage
from app.database.crud.user import get_user_by_id

router = APIRouter(prefix="/api/usage", tags=["usage"])

_FEATURES = ("transcription", "correction", "derushing", "normalization", "color_correction")
_FEATURE_TO_LIMIT_KEY = {
    "transcription": "transcriptions",
    "correction": "corrections",
    "derushing": "derushages",
    "normalization": "normalizations",
    "color_correction": "color_corrections",
}


async def get_current_user(access_token: str = Cookie(None)) -> SimpleNamespace:
    if not access_token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    payload = decode_jwt(access_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    # Always read plan from DB (not JWT) — JWT plan can be stale after upgrade
    user = await get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return SimpleNamespace(
        user_id=str(user["id"]),
        email=user["email"],
        plan=user["plan"],
        seat_count=user.get("seat_count", 1) or 1,
    )


@router.get("/current", response_model=UsageCurrentResponse)
async def get_current_usage_endpoint(
    api_key_id: int = Query(None),
    current_user: SimpleNamespace = Depends(get_current_user),
):
    """Return monthly usage counters per feature merged with plan limits."""
    counts = await get_current_usage(
        user_id=current_user.user_id,
        api_key_id=api_key_id,
    )

    limits = get_plan_limits(current_user.plan, current_user.seat_count)
    period = datetime.now(tz=timezone.utc).strftime("%Y-%m")

    features = {
        f: FeatureUsage(used=counts[f], limit=limits[_FEATURE_TO_LIMIT_KEY[f]])
        for f in _FEATURES
    }

    return UsageCurrentResponse(
        plan=current_user.plan,
        period=period,
        features=features,
    )
