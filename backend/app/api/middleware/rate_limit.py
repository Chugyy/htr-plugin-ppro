#!/usr/bin/env python3
# app/api/middleware/rate_limit.py

import time
import logging
from typing import Dict, List
from fastapi import HTTPException, Request
from config.config import settings

logger = logging.getLogger(__name__)

# In-memory store: "{api_key}:{group}" → [timestamps]
_requests: Dict[str, List[float]] = {}

# Endpoint group → max requests per minute
_LIMITS = {
    "transcription": lambda: settings.rate_limit_transcription,
    "correction": lambda: settings.rate_limit_correction,
    "optimization": lambda: settings.rate_limit_optimization,
    "upload": lambda: settings.rate_limit_upload,
}


def _resolve_group(path: str) -> str | None:
    """Extract rate limit group from request path."""
    for group in _LIMITS:
        if group in path:
            return group
    return None


def _check_rate_limit(key: str, max_requests: int) -> float | None:
    """
    Check if key has exceeded rate limit.
    Returns None if OK, or seconds until next available slot if exceeded.
    """
    now = time.time()
    window_start = now - 60.0

    # Get and clean timestamps
    timestamps = _requests.get(key, [])
    timestamps = [t for t in timestamps if t > window_start]
    _requests[key] = timestamps

    if len(timestamps) >= max_requests:
        oldest = min(timestamps)
        retry_after = oldest + 60.0 - now
        return max(retry_after, 1.0)

    # Record this request
    timestamps.append(now)
    return None


async def check_rate_limit(request: Request):
    """FastAPI dependency to enforce per-endpoint rate limiting."""
    path = request.url.path
    group = _resolve_group(path)

    if group is None:
        return  # No rate limit for this endpoint

    # Extract API key from Authorization header (already validated by auth middleware)
    auth = request.headers.get("authorization", "")
    api_key = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else "anonymous"

    key = f"{api_key}:{group}"
    limit_fn = _LIMITS[group]
    max_requests = limit_fn()

    retry_after = _check_rate_limit(key, max_requests)
    if retry_after is not None:
        logger.warning(f"[RATE_LIMIT] {group} limit exceeded for key={api_key[:8]}... | retry_after={retry_after:.0f}s")
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded for {group}. Max {max_requests} requests/min.",
            headers={"Retry-After": str(int(retry_after))},
        )
