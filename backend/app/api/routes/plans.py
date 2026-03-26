#!/usr/bin/env python3
# app/api/routes/plans.py

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.api.models.usage import Plan, PlanLimits, PlansResponse, TrialInfo, PlanPrice
from app.core.utils.plans import get_all_plans, _PLAN_LIMITS
from config.config import settings

router = APIRouter(prefix="/api/plans", tags=["plans"])

_TRIAL_DAYS = 14


@router.get("", response_model=PlansResponse)
async def get_plans_endpoint():
    """Return all available plans with Stripe price IDs. Public — no auth required."""
    raw_plans = get_all_plans(settings)

    plans = [
        Plan(
            id=p["id"],
            name=p["name"],
            description=p["description"],
            prices={
                interval: PlanPrice(**price_data)
                for interval, price_data in p["prices"].items()
            },
            limits=PlanLimits(**p["limits"]),
            limits_note=p.get("limits_note"),
            features=p["features"],
            highlighted=p["highlighted"],
            min_seats=p.get("min_seats"),
            trial_days=p["trial_days"],
        )
        for p in raw_plans
    ]

    trial_limits = _PLAN_LIMITS["trial"]

    response_data = PlansResponse(
        plans=plans,
        trial=TrialInfo(limits=PlanLimits(**trial_limits), days=_TRIAL_DAYS),
    )

    return JSONResponse(
        content=response_data.model_dump(by_alias=True),
        headers={"Cache-Control": "public, max-age=3600"},
    )
