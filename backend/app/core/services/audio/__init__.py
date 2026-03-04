#!/usr/bin/env python3
# app/core/services/audio/__init__.py

"""Audio processing services"""

from .extraction import (
    extract_audio_segment,
    combine_audio_timeline,
    ClipTimelineInfo
)
from .optimization import (
    apply_optimization
)
from .utils import (
    get_audio_duration
)

__all__ = [
    "extract_audio_segment",
    "combine_audio_timeline",
    "ClipTimelineInfo",
    "apply_optimization",
    "get_audio_duration",
]
