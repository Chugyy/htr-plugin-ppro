import hashlib
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt

from config.config import settings


# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a plain-text password with bcrypt (cost factor 12)."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Return True if password matches the bcrypt hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------

def generate_jwt(user_id: int, email: str, plan: str = "free") -> str:
    """Return a signed HS256 JWT. Expiry driven by settings.jwt_expiration_hours."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "plan": plan,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expiration_hours),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_jwt(token: str) -> Optional[dict]:
    """Decode and verify a JWT. Returns payload dict or None on any error."""
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None


# ---------------------------------------------------------------------------
# API key
# ---------------------------------------------------------------------------

def generate_api_key() -> str:
    """Return a new API key with dk_ prefix and 32-byte URL-safe random suffix."""
    return f"dk_{secrets.token_urlsafe(32)}"


# ---------------------------------------------------------------------------
# Password-reset token
# ---------------------------------------------------------------------------

def generate_reset_token() -> tuple[str, str]:
    """Return (raw_token, token_hash) — raw is URL-safe 32 bytes, hash is SHA-256."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def hash_token(token: str) -> str:
    """Return SHA-256 hex digest of the given token string."""
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Disposable email domains (most common ones)
_DISPOSABLE_DOMAINS = {
    "yopmail.com", "tempmail.com", "guerrillamail.com", "mailinator.com",
    "throwaway.email", "trashmail.com", "10minutemail.com", "temp-mail.org",
    "fakeinbox.com", "maildrop.cc", "dispostable.com", "sharklasers.com",
    "guerrillamailblock.com", "grr.la", "guerrillamail.info", "guerrillamail.net",
    "mailnesia.com", "getairmail.com", "tempr.email", "discard.email",
}


def normalize_email(email: str) -> str:
    """Normalize email to catch alias abuse (Gmail dots, plus-addressing)."""
    email = email.strip().lower()
    local, _, domain = email.partition("@")
    if not domain:
        return email

    # Remove plus-addressing: user+alias@gmail.com → user@gmail.com
    local = local.split("+")[0]

    # Remove dots in Gmail (u.s.e.r@gmail.com → user@gmail.com)
    if domain in ("gmail.com", "googlemail.com"):
        local = local.replace(".", "")

    # googlemail.com → gmail.com
    if domain == "googlemail.com":
        domain = "gmail.com"

    return f"{local}@{domain}"


def is_disposable_email(email: str) -> bool:
    """Check if email uses a known disposable/temporary domain."""
    domain = email.strip().lower().split("@")[-1]
    return domain in _DISPOSABLE_DOMAINS


def validate_register_inputs(email: str, password: str, name: str) -> list[str]:
    """
    Validate registration fields.

    Returns a list of error message strings. Empty list means all inputs are valid.
    Does NOT raise — callers decide how to handle the errors.
    """
    errors: list[str] = []

    normalized_email = email.strip().lower()
    if not _EMAIL_RE.match(normalized_email):
        errors.append("email is invalid")

    if len(password) < 8:
        errors.append("password must be at least 8 characters")

    if not name.strip():
        errors.append("name is required")

    return errors
