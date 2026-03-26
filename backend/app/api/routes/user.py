#!/usr/bin/env python3
# app/api/routes/user.py

from types import SimpleNamespace
from fastapi import APIRouter, Cookie, Header, HTTPException, Response

from config.config import settings
from app.core.utils.auth import decode_jwt
from app.database.crud.user import get_user_by_id
from app.database.crud.api_key import get_api_key_by_key
from app.api.models.user import (
    RegisterRequest,
    RegisterResponse,
    LoginRequest,
    LoginResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
    MessageResponse,
)
from app.core.jobs.user import (
    register_user,
    login_user,
    request_password_reset,
    reset_password,
    verify_email,
    resend_verification_code,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    AccountBannedError,
    InvalidTokenError,
    TokenExpiredError,
    StripeServiceError,
    SMTPServiceError,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_COOKIE_NAME = "access_token"
_COOKIE_MAX_AGE = 7 * 24 * 3600  # 7 days


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.production,
        samesite="lax",
        path="/",
        max_age=_COOKIE_MAX_AGE,
    )


def _clear_auth_cookie(response: Response) -> None:
    response.set_cookie(
        key=_COOKIE_NAME,
        value="",
        httponly=True,
        secure=settings.production,
        samesite="lax",
        path="/",
        max_age=0,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register_endpoint(data: RegisterRequest, response: Response):
    try:
        result = await register_user(
            email=data.email,
            password=data.password,
            name=data.name,
        )
    except EmailAlreadyExistsError:
        raise HTTPException(status_code=409, detail="Email already registered")
    except StripeServiceError:
        raise HTTPException(status_code=502, detail="Payment service unavailable")

    _set_auth_cookie(response, result["token"])
    return RegisterResponse(user=result["user"], api_key=result["api_key"])


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email_endpoint(data: VerifyEmailRequest, access_token: str = Cookie(None)):
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_jwt(access_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        result = await verify_email(user_id=payload["sub"], code=data.code)
    except InvalidTokenError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except TokenExpiredError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if result.get("already_verified"):
        return MessageResponse(message="Email already verified")
    return MessageResponse(message="Email verified")


@router.post("/resend-code", response_model=MessageResponse)
async def resend_code_endpoint(access_token: str = Cookie(None)):
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_jwt(access_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        await resend_verification_code(user_id=payload["sub"])
    except SMTPServiceError:
        raise HTTPException(status_code=502, detail="Failed to send email")
    except InvalidTokenError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return MessageResponse(message="Code sent")


@router.post("/login", response_model=LoginResponse)
async def login_endpoint(data: LoginRequest, response: Response):
    try:
        result = await login_user(email=data.email, password=data.password)
    except InvalidCredentialsError:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    except AccountBannedError:
        raise HTTPException(status_code=403, detail="Account is banned")

    _set_auth_cookie(response, result["token"])
    return LoginResponse(user=result["user"])


@router.post("/logout", response_model=MessageResponse)
async def logout_endpoint(response: Response):
    _clear_auth_cookie(response)
    return MessageResponse(message="Logged out")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password_endpoint(data: ForgotPasswordRequest):
    await request_password_reset(email=data.email)
    return MessageResponse(message="If this email exists, a reset link has been sent")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password_endpoint(data: ResetPasswordRequest):
    try:
        await reset_password(raw_token=data.token, new_password=data.new_password)
    except (InvalidTokenError, TokenExpiredError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return MessageResponse(message="Password updated")


@router.get("/me")
async def me_endpoint(access_token: str = Cookie(None)):
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_jwt(access_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "plan": user["plan"],
        "subscriptionStatus": user["subscription_status"],
        "stripCustomerId": user.get("stripe_customer_id"),
    }


@router.get("/validate-key")
async def validate_key_endpoint(x_api_key: str = Header(alias="X-API-Key")):
    """Validate an API key from the plugin. Returns user plan info or 403."""
    if not x_api_key:
        raise HTTPException(status_code=403, detail="Missing API key")

    key_row = await get_api_key_by_key(x_api_key)
    if not key_row:
        raise HTTPException(status_code=403, detail="Invalid API key", headers={"X-Error-Code": "INVALID_KEY"})

    user = await get_user_by_id(str(key_row["user_id"]))
    if not user:
        raise HTTPException(status_code=403, detail="User not found")

    status = user["subscription_status"]
    if status not in ("active", "trialing"):
        # Check grace period for past_due
        if status == "past_due" and user.get("payment_failed_at"):
            from datetime import datetime, timezone
            days = (datetime.now(timezone.utc) - user["payment_failed_at"]).days
            if days > 7:
                raise HTTPException(status_code=403, detail="Subscription expired")
        elif status != "past_due":
            raise HTTPException(status_code=403, detail="No active subscription", headers={"X-Error-Code": "NO_SUBSCRIPTION"})

    return {
        "valid": True,
        "plan": user["plan"],
        "subscriptionStatus": status,
    }
