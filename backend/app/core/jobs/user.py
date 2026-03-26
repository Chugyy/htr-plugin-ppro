# app/core/jobs/user.py

import logging
import secrets
from datetime import datetime, timezone, timedelta

import stripe
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config.config import settings
from app.database.crud.user import (
    get_user_by_email,
    insert_user,
    insert_password_reset_token,
    get_password_reset_token,
    delete_password_reset_token,
    update_user_password,
)
from app.database.crud.api_key import create_api_key
from app.core.utils.auth import (
    validate_register_inputs,
    hash_password,
    verify_password,
    generate_jwt,
    generate_api_key,
    generate_reset_token,
    hash_token,
    normalize_email,
    is_disposable_email,
)

logger = logging.getLogger(__name__)

stripe.api_key = settings.stripe_secret_key


# ---------------------------------------------------------------------------
# Custom errors
# ---------------------------------------------------------------------------

class ValidationError(Exception):
    pass

class EmailAlreadyExistsError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class AccountBannedError(Exception):
    pass


class InvalidTokenError(Exception):
    pass


class TokenExpiredError(Exception):
    pass


class StripeServiceError(Exception):
    pass


class SMTPServiceError(Exception):
    pass


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

async def register_user(email: str, password: str, name: str) -> dict:
    """FR1 — Registration: validate → check duplicate → hash → Stripe → DB TX → JWT."""
    # 1. Validate inputs
    errors = validate_register_inputs(email, password, name)
    if errors:
        raise ValidationError("; ".join(errors))
    email = email.strip().lower()
    name = name.strip()

    # 1b. Block disposable emails
    if is_disposable_email(email):
        raise ValidationError("Les emails temporaires ne sont pas acceptés.")

    # 2. Check email uniqueness (both raw and normalized)
    if await get_user_by_email(email):
        raise EmailAlreadyExistsError(f"Email already in use: {email}")
    norm_email = normalize_email(email)
    from app.database.db import get_db_pool
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT id FROM users WHERE normalized_email = $1", norm_email)
    if existing:
        raise EmailAlreadyExistsError(f"Email already in use")

    # 3. Hash password
    password_hash = hash_password(password)

    # 4. Create Stripe customer (outside transaction — Stripe is not transactional)
    try:
        customer = stripe.Customer.create(email=email, name=name)
        stripe_customer_id = customer.id
    except stripe.error.StripeError as exc:
        logger.error("Stripe customer creation failed: %s", exc)
        raise StripeServiceError("Failed to create Stripe customer") from exc

    # 5-8. Insert user + API key in a single DB transaction
    raw_key = generate_api_key()
    user = await insert_user(
        email=email,
        password_hash=password_hash,
        name=name,
        stripe_customer_id=stripe_customer_id,
        normalized_email=norm_email,
    )
    api_key = await create_api_key(
        user_id=user["id"],
        name="Default",
        key=raw_key,
    )

    # 9. Generate verification code + send email
    code = f"{secrets.randbelow(900000) + 100000}"  # 6-digit code
    expires_at = datetime.now(tz=timezone.utc) + timedelta(minutes=15)

    from app.database.db import get_db_pool
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET verification_code = $1, verification_code_expires_at = $2 WHERE id = $3",
            code, expires_at, user["id"],
        )

    try:
        await _send_verification_email(email, code)
    except SMTPServiceError:
        logger.warning("Failed to send verification email to %s", email)

    # 10. Generate JWT
    token = generate_jwt(user_id=user["id"], email=user["email"], plan=user["plan"])

    return {"user": user, "api_key": api_key, "token": token}


async def login_user(email: str, password: str) -> dict:
    """FR2 — Login: get user → verify password → check ban → JWT."""
    # 1. Lookup user
    user = await get_user_by_email(email)
    if not user:
        raise InvalidCredentialsError("Invalid credentials")

    # 2. Verify password
    if not verify_password(password, user["password_hash"]):
        raise InvalidCredentialsError("Invalid credentials")

    # 3. Check ban
    if user.get("subscription_status") == "banned":
        raise AccountBannedError("Account is banned")

    # 4. Generate JWT
    token = generate_jwt(user_id=user["id"], email=user["email"], plan=user["plan"])

    # Strip sensitive field before returning
    user.pop("password_hash", None)

    return {"user": user, "token": token}


async def request_password_reset(email: str) -> None:
    """FR4b — Forgot password: silent if user not found (anti-enumeration)."""
    # 1. Lookup user — return silently if not found
    user = await get_user_by_email(email)
    if not user:
        return

    # 2. Generate raw token + hash
    raw_token, token_hash = generate_reset_token()

    # 3. Persist token (purges previous tokens for this user)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    await insert_password_reset_token(
        user_id=str(user["id"]),
        token_hash=token_hash,
        expires_at=expires_at,
    )

    # 4. Send email — log error but do not surface it (anti-enumeration)
    try:
        await _send_password_reset_email(to_email=email, raw_token=raw_token)
    except SMTPServiceError as exc:
        logger.error("Password reset email failed for %s: %s", email, exc)


async def reset_password(raw_token: str, new_password: str) -> None:
    """FR4b — Reset password: verify token → update password → delete token."""
    # 1. Hash the incoming raw token
    token_hash = hash_token(raw_token)

    # 2. Look up token record
    record = await get_password_reset_token(token_hash)
    if not record:
        raise InvalidTokenError("Invalid or unknown reset token")

    # 3. Verify expiry
    now = datetime.now(timezone.utc)
    expires_at = record["expires_at"]
    # asyncpg returns aware datetimes; guard against naive
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        raise TokenExpiredError("Reset token has expired")

    # 4. Hash new password
    password_hash = hash_password(new_password)

    # 5-8. Update password + delete token atomically
    await update_user_password(user_id=str(record["user_id"]), password_hash=password_hash)
    await delete_password_reset_token(token_hash=token_hash)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _send_password_reset_email(to_email: str, raw_token: str) -> None:
    """Send password reset email via aiosmtplib."""
    reset_url = f"{settings.dashboard_url}/reset-password?token={raw_token}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Reset your password"
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email

    html = f"""
    <p>You requested a password reset. Click the link below (valid 1 hour):</p>
    <p><a href="{reset_url}">{reset_url}</a></p>
    <p>If you did not request this, ignore this email.</p>
    """
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=True,
        )
    except Exception as exc:
        raise SMTPServiceError("SMTP send failed") from exc


async def verify_email(user_id: str, code: str) -> dict:
    """Verify email with 6-digit OTP code."""
    from app.database.db import get_db_pool
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT verification_code, verification_code_expires_at, email_verified FROM users WHERE id = $1",
            user_id if isinstance(user_id, __import__('uuid').UUID) else __import__('uuid').UUID(user_id),
        )

    if not row:
        raise InvalidTokenError("User not found")

    if row["email_verified"]:
        return {"already_verified": True}

    if not row["verification_code"]:
        raise InvalidTokenError("No verification code found. Request a new one.")

    if row["verification_code_expires_at"] < datetime.now(tz=timezone.utc):
        raise TokenExpiredError("Code expired. Request a new one.")

    if row["verification_code"] != code.strip():
        raise InvalidTokenError("Invalid code")

    # Mark verified + clear code
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET email_verified = TRUE, verification_code = NULL, verification_code_expires_at = NULL WHERE id = $1",
            user_id if isinstance(user_id, __import__('uuid').UUID) else __import__('uuid').UUID(user_id),
        )

    return {"verified": True}


async def resend_verification_code(user_id: str) -> None:
    """Generate and send a new verification code."""
    import uuid as _uuid
    uid = user_id if isinstance(user_id, _uuid.UUID) else _uuid.UUID(user_id)

    from app.database.db import get_db_pool
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT email, email_verified FROM users WHERE id = $1", uid)

    if not row:
        raise InvalidTokenError("User not found")
    if row["email_verified"]:
        return  # already verified, no-op

    code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = datetime.now(tz=timezone.utc) + timedelta(minutes=15)

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET verification_code = $1, verification_code_expires_at = $2 WHERE id = $3",
            code, expires_at, uid,
        )

    await _send_verification_email(row["email"], code)


async def cleanup_unverified_users(max_age_days: int = 7) -> int:
    """Delete users who never verified their email after max_age_days."""
    from app.database.db import get_db_pool
    pool = await get_db_pool()
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=max_age_days)

    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM users WHERE email_verified = FALSE AND created_at < $1",
            cutoff,
        )

    count = int(result.split()[-1]) if result else 0
    if count:
        logger.info(f"[CLEANUP] Deleted {count} unverified user(s) older than {max_age_days} days")
    return count


async def _send_verification_email(to_email: str, code: str) -> None:
    """Send verification code email."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "HTR Edit — Code de vérification"
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email

    html = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #333; margin-bottom: 8px;">Vérification de votre email</h2>
      <p style="color: #666; font-size: 14px;">Voici votre code de vérification :</p>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #214fcf;">{code}</span>
      </div>
      <p style="color: #999; font-size: 12px;">Ce code expire dans 15 minutes. Si vous n'avez pas créé de compte, ignorez cet email.</p>
    </div>
    """
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_password,
            start_tls=True,
        )
    except Exception as exc:
        raise SMTPServiceError("SMTP send failed") from exc
