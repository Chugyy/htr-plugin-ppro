#!/usr/bin/env python3
# app/api/models/user.py

from pydantic import EmailStr, Field
from typing import Literal
from uuid import UUID
from datetime import datetime

from app.api.models.common import BaseSchema


# ---------------------------------------------------------------------------
# Shared sub-models
# ---------------------------------------------------------------------------

class UserOut(BaseSchema):
    id: UUID
    email: EmailStr
    name: str
    plan: Literal["free", "starter", "pro", "agency", "unlimited"]
    subscription_status: Literal["none", "trialing", "active", "past_due", "cancelled", "banned"]
    email_verified: bool = False
    created_at: datetime


class ApiKeyOut(BaseSchema):
    id: int
    name: str
    key: str  # "dk_..." plaintext — returned only on creation
    is_active: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class RegisterRequest(BaseSchema):
    email: EmailStr = Field(..., max_length=255)
    password: str = Field(..., min_length=8)
    name: str = Field(..., min_length=1, max_length=255)


class LoginRequest(BaseSchema):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseSchema):
    email: EmailStr


class ResetPasswordRequest(BaseSchema):
    token: str
    new_password: str = Field(..., min_length=8)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class RegisterResponse(BaseSchema):
    user: UserOut
    api_key: ApiKeyOut


class LoginResponse(BaseSchema):
    user: UserOut


class VerifyEmailRequest(BaseSchema):
    code: str = Field(..., min_length=6, max_length=6)


class MessageResponse(BaseSchema):
    message: str
