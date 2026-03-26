#!/usr/bin/env python3
# app/api/models/api_key.py

from datetime import datetime
from typing import Optional

from pydantic import Field

from app.api.models.common import BaseSchema


class ApiKeyCreateRequest(BaseSchema):
    name: str = Field(..., min_length=1, max_length=100, strip_whitespace=True)


class ApiKeyResponse(BaseSchema):
    id: int
    name: str
    key: str
    created_at: datetime
    last_used_at: Optional[datetime] = None
