#!/usr/bin/env python3
# app/api/routes/auth.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from config.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# EXPIRATION — current approach (frontend-side):
#   Key expiry is enforced client-side only (30-day storedAt check in authService.ts).
#   This endpoint only verifies that the key matches the value in config/.env.
#   The backend key itself is static and never expires on its own.
#
# EXPIRATION — future approach (backend-side dynamic keys):
#   1. Add a `POST /auth/token` endpoint that generates a signed token:
#      `token = HMAC(f"{issued_at}:{expires_at}", SECRET_KEY)`
#   2. Update this endpoint to decode the token and verify:
#      - the HMAC signature (authenticity)
#      - the `expires_at` field (expiry enforced server-side)
#   3. The frontend storedAt check becomes a UX-only pre-check;
#      the backend becomes the single source of truth for validity.


class ValidateRequest(BaseModel):
    api_key: str


@router.post("/validate")
async def validate_api_key(body: ValidateRequest):
    """Validate an admin API key — returns 200 if valid, 403 if not."""
    if body.api_key != settings.api_key:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return {"valid": True}
