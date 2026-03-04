#!/usr/bin/env python3
# app/api/models/common.py

"""
Common Pydantic models shared across multiple endpoints.

These models are used across multiple entities and should NOT be duplicated.
When creating new entity-specific models, check this file first to avoid duplication.

Available common models:
- BaseSchema: Base class with automatic snake_case → camelCase conversion
- Token: Authentication token response
- PaginationInfo: Pagination metadata
- ErrorResponse: Standard error response
- MessageResponse: Generic success message
- IdResponse: Generic ID response
"""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from typing import Optional


# =====================================================
# BASE SCHEMA (snake_case → camelCase conversion)
# =====================================================

class BaseSchema(BaseModel):
    """
    Base class for all Pydantic schemas with automatic snake_case → camelCase conversion.

    ⚠️ ALL Request/Response schemas MUST inherit from this class.

    Why camelCase in JSON?
    - JavaScript/TypeScript convention (Next.js frontend)
    - Avoids frontend conversion overhead
    - Better DX for frontend developers

    Configuration:
    - alias_generator=to_camel: Python snake_case → JSON camelCase
    - populate_by_name=True: Accepts both snake_case AND camelCase as input
    - from_attributes=True: Allows .model_validate(orm_obj)

    Example:
        class UserResponse(BaseSchema):
            first_name: str      # Python: snake_case
            created_at: datetime

        # JSON output automatically:
        # {"firstName": "John", "createdAt": "2025-01-15T10:30:00Z"}

    IMPORTANT:
    - ✅ Python code: ALWAYS snake_case (first_name, created_at)
    - ✅ JSON API: ALWAYS camelCase (firstName, createdAt)
    - ❌ NEVER write firstName in Python code (breaks PEP-8)
    """
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# =====================================================
# AUTHENTICATION
# =====================================================

class Token(BaseSchema):
    """
    Authentication token response.

    Used by: /auth/login, /auth/register

    JSON output: {"accessToken": "...", "tokenType": "bearer", "userId": 123}
    """
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type (always 'bearer')")
    user_id: int = Field(..., description="ID of authenticated user")


# =====================================================
# PAGINATION
# =====================================================

class PaginationInfo(BaseSchema):
    """
    Pagination metadata for paginated list endpoints.

    Used by: All list endpoints with pagination

    Note: totalPages is already camelCase in Python to match JSON convention
    (exception to snake_case rule for clarity)

    JSON output:
        {
            "page": 2,
            "limit": 20,
            "total": 45,
            "totalPages": 3
        }
    """
    page: int = Field(..., ge=1, description="Current page number (starts at 1)")
    limit: int = Field(..., ge=1, le=100, description="Number of items per page")
    total: int = Field(..., ge=0, description="Total number of items")
    total_pages: int = Field(..., ge=0, description="Total number of pages")


# =====================================================
# GENERIC RESPONSES
# =====================================================

class ErrorResponse(BaseSchema):
    """
    Standard error response format.

    Used by: All error responses (automatically by FastAPI HTTPException)

    JSON output:
        {
            "detail": "User not found",
            "code": "USER_NOT_FOUND"
        }
    """
    detail: str = Field(..., description="Human-readable error message")
    code: Optional[str] = Field(None, description="Machine-readable error code")


class MessageResponse(BaseSchema):
    """
    Generic success message response.

    Used by: Endpoints that return simple success messages (delete, etc.)

    JSON output:
        {
            "message": "User deleted successfully"
        }
    """
    message: str = Field(..., description="Success message")


# =====================================================
# ID RESPONSES
# =====================================================

class IdResponse(BaseSchema):
    """
    Generic ID response for creation endpoints.

    Used by: POST endpoints that return only an ID

    JSON output:
        {
            "id": 123
        }
    """
    id: int = Field(..., description="ID of created resource")
