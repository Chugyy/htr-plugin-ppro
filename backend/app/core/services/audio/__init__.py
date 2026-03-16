#!/usr/bin/env python3
# app/core/services/audio/__init__.py

"""Audio processing services"""

from .extraction import (
    extract_audio_segment,
    combine_audio_timeline,
    ClipTimelineInfo
)
from .optimization import (
    apply_optimization,
    apply_optimization_chunk,
    measure_loudness,
    split_audio,
    concat_chunks,
)
from .utils import (
    get_audio_duration
)

__all__ = [
    "extract_audio_segment",
    "combine_audio_timeline",
    "ClipTimelineInfo",
    "apply_optimization",
    "apply_optimization_chunk",
    "measure_loudness",
    "split_audio",
    "concat_chunks",
    "get_audio_duration",
]
