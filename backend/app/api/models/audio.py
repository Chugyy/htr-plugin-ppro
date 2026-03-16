#!/usr/bin/env python3
# app/api/models/audio.py

from typing import List, Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel, Field
from app.api.models.common import BaseSchema


class AudioClipDTO(BaseSchema):
    """Audio clip information from frontend"""
    clip_name: str = Field(..., description="Name of the video clip")
    source_file_path: str = Field(..., description="Path to source video/audio file")
    source_in_point: float = Field(..., description="In point in source file (seconds)")
    source_out_point: float = Field(..., description="Out point in source file (seconds)")
    timeline_start: float = Field(..., description="Timeline start position (seconds)")
    timeline_end: float = Field(..., description="Timeline end position (seconds)")
    preextracted: bool = Field(False, description="True when audio is already extracted — skip ffmpeg extraction")


class TranscriptionRequest(BaseSchema):
    """Request to generate transcription from clips"""
    clips: List[AudioClipDTO] = Field(..., description="List of video clips to transcribe")
    speaker_id: Optional[str] = Field(None, description="Speaker UUID for multi-speaker transcription")
    speaker_name: Optional[str] = Field(None, description="Speaker display name")


class TranscriptionResponse(BaseSchema):
    """Response with generated transcription"""
    transcription_json: Dict[str, Any] = Field(..., description="Transcription JSON (Premiere format)")
    text: str = Field(..., description="Full transcription text")
    duration: float = Field(..., description="Total duration in seconds")
    word_count: int = Field(..., description="Number of words transcribed")


class CorrectionRequest(BaseSchema):
    """Request to correct transcription"""
    transcription_json: Dict[str, Any] = Field(..., description="Transcription JSON to correct")


class CorrectionResponse(BaseSchema):
    """Response with corrected transcription"""
    corrected_json: Dict[str, Any] = Field(..., description="Corrected transcription JSON")
    corrections_applied: bool = Field(..., description="Whether corrections were applied")
    model_used: str = Field(..., description="Correction engine used (grammalecte)")
    errors_detected: Dict[str, int] = Field(
        default={"grammar": 0, "spelling": 0, "total": 0},
        description="Number of errors detected by type"
    )


class FilterType(str, Enum):
    """Audio filter types for optimization"""
    VOICE = "voice"
    MUSIC = "music"
    SOUND_EFFECTS = "sound_effects"


class TrackOptimizationDTO(BaseSchema):
    """Single track optimization settings"""
    track_index: int = Field(..., description="Track index number")
    filter_type: FilterType = Field(..., description="Type of audio filter to apply")
    clips: List[AudioClipDTO] = Field(..., description="List of clips in this track")


class OptimizationRequest(BaseSchema):
    """Request to optimize audio tracks"""
    tracks: List[TrackOptimizationDTO] = Field(..., description="List of tracks to optimize")


class OptimizedClipResult(BaseSchema):
    """Optimized clip result — typed for camelCase serialization"""
    clip_name: str
    optimized_path: str
    duration: float
    timeline_start: float
    timeline_end: float


class OptimizedTrackResult(BaseSchema):
    """Optimized track result — typed for camelCase serialization"""
    track_index: int
    filter_type: str
    clips: List[OptimizedClipResult]


class OptimizationResponse(BaseSchema):
    """Response with optimized tracks"""
    success: bool = Field(default=True)
    optimized_tracks: List[OptimizedTrackResult] = Field(..., description="List of optimized track results")
    processing_time: float = Field(..., description="Total processing time in seconds")
    output_directory: str = Field(..., description="Directory containing optimized files")
