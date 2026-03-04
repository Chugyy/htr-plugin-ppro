#!/usr/bin/env python3
# app/api/middleware/auth.py

from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config.config import settings

security = HTTPBearer()

async def verify_api_key(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Verify API key in Authorization: Bearer {key} header"""
    if credentials.credentials != settings.api_key:
        raise HTTPException(
            status_code=403,
            detail="Invalid API key"
        )
    return credentials.credentials
