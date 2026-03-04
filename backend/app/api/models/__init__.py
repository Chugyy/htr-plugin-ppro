#!/usr/bin/env python3
# app/api/models/__init__.py

"""
Pydantic schemas for API validation.

Structure:
- common.py: Shared models (BaseSchema, MessageResponse, ErrorResponse)
- audio.py: Audio extraction models
"""

# =====================================================
# COMMON MODELS (always available)
# =====================================================

from app.api.models.common import (
    BaseSchema,
    MessageResponse,
    ErrorResponse,
)

# =====================================================
# ENTITY-SPECIFIC MODELS
# =====================================================

# Audio models
from app.api.models.audio import (
    AudioClipDTO,
    TranscriptionRequest,
    TranscriptionResponse,
    CorrectionRequest,
    CorrectionResponse,
)

# =====================================================
# EXPORTS
# =====================================================

__all__ = [
    # Common models
    "BaseSchema",
    "MessageResponse",
    "ErrorResponse",
    # Audio models
    "AudioClipDTO",
    "TranscriptionRequest",
    "TranscriptionResponse",
    "CorrectionRequest",
    "CorrectionResponse",
]
