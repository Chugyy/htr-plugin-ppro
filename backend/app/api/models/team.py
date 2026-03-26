#!/usr/bin/env python3
# app/api/models/team.py

from pydantic import EmailStr, Field
from typing import Optional
from datetime import datetime, date

from app.api.models.common import BaseSchema


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class InviteTeamMemberRequest(BaseSchema):
    email: EmailStr


class AddTeamSeatsRequest(BaseSchema):
    quantity: int = Field(..., ge=1)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class TeamMemberResponse(BaseSchema):
    user_id: str           # UUID
    name: str
    email: str
    role: str              # 'owner' | 'member'
    joined_at: datetime
    usage_this_month: int


class TeamMembersListResponse(BaseSchema):
    data: list[TeamMemberResponse]
    seat_count: int
    member_count: int


class InviteTeamMemberResponse(BaseSchema):
    invite_id: int
    email: str
    expires_at: datetime


class AddTeamSeatsResponse(BaseSchema):
    team_id: int
    new_seat_count: int
    stripe_subscription_item_id: str
