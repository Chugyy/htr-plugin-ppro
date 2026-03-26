#!/usr/bin/env python3
# app/api/models/subscription.py

from pydantic import Field
from typing import Literal, Optional
from datetime import datetime

from app.api.models.common import BaseSchema


# ---------------------------------------------------------------------------
# Enums / Literals
# ---------------------------------------------------------------------------

PlanKey = Literal["starter_monthly", "starter_annual", "pro_monthly", "pro_annual", "agency_monthly"]
PlanName = Literal["free", "starter", "pro", "agency"]
SubscriptionStatus = Literal["none", "trialing", "active", "past_due", "cancelled", "banned"]


# ---------------------------------------------------------------------------
# Request Models
# ---------------------------------------------------------------------------

class CheckoutRequest(BaseSchema):
    price_key: PlanKey
    quantity: int = Field(default=1, ge=1)


class PortalRequest(BaseSchema):
    return_url: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------

class CheckoutResponse(BaseSchema):
    checkout_url: str


class PortalResponse(BaseSchema):
    portal_url: str


class BillingStatusResponse(BaseSchema):
    plan: PlanName
    subscription_status: Optional[SubscriptionStatus]
    current_period_end: Optional[datetime]
    cancel_at_period_end: bool
    trial_days_remaining: Optional[int]


class WebhookAckResponse(BaseSchema):
    received: bool = True
