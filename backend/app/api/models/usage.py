#!/usr/bin/env python3
# app/api/models/usage.py

from enum import Enum
from typing import Literal

from app.api.models.common import BaseSchema


# ---------------------------------------------------------------------------
# GET /api/usage/current
# ---------------------------------------------------------------------------

class FeatureUsage(BaseSchema):
    used: int
    limit: int


class UsageCurrentResponse(BaseSchema):
    plan: Literal["free", "trial", "starter", "pro", "agency", "unlimited"]
    period: str  # "YYYY-MM"
    features: dict[
        Literal["transcription", "correction", "derushing", "normalization", "color_correction"],
        FeatureUsage,
    ]


# ---------------------------------------------------------------------------
# Middleware error models
# ---------------------------------------------------------------------------

class UsageErrorCode(str, Enum):
    LIMIT_REACHED   = "LIMIT_REACHED"
    NO_SUBSCRIPTION = "NO_SUBSCRIPTION"
    INVALID_KEY     = "INVALID_KEY"
    PAYMENT_FAILED  = "PAYMENT_FAILED"


class UsageErrorDetails(BaseSchema):
    feature: str | None = None
    used: int | None = None
    limit: int | None = None
    dashboard_url: str | None = None


class UsageErrorResponse(BaseSchema):
    error: str
    code: UsageErrorCode
    details: UsageErrorDetails


# ---------------------------------------------------------------------------
# GET /api/plans
# ---------------------------------------------------------------------------

class PlanPrice(BaseSchema):
    amount: int
    currency: str
    display: str
    stripe_price_id: str
    interval: str
    per_seat: bool = False
    display_yearly: str | None = None


class PlanLimits(BaseSchema):
    transcriptions: int
    corrections: int
    derushages: int
    normalizations: int
    color_corrections: int


class Plan(BaseSchema):
    id: str
    name: str
    description: str
    prices: dict[str, PlanPrice]
    limits: PlanLimits
    limits_note: str | None = None
    features: list[str]
    highlighted: bool
    min_seats: int | None
    trial_days: int


class TrialInfo(BaseSchema):
    limits: PlanLimits
    days: int


class PlansResponse(BaseSchema):
    plans: list[Plan]
    trial: TrialInfo
