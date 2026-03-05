#!/usr/bin/env python3
# app/core/jobs/optimization.py

import logging
import time
from typing import List, Dict, Any
from pathlib import Path
from app.api.models.audio import TrackOptimizationDTO
from app.core.services.audio import get_audio_duration
from app.core.services.audio.optimization import apply_optimization
from app.core.jobs.utils import resolve_clip_audio
from config.config import settings

logger = logging.getLogger(__name__)


async def optimize_tracks(tracks: List[TrackOptimizationDTO]) -> Dict[str, Any]:
    """
    Optimize audio tracks with filters based on type

    Workflow (following pattern from jobs/transcription.py):
    1. For each track:
        - For each clip:
            a. Extract audio segment (temp file)
            b. Apply optimization (final file)
            c. Store optimized file path
    2. Cleanup intermediate extracted files
    3. PRESERVE optimized files (no cleanup)

    Args:
        tracks: List of tracks with clips and filter type

    Returns:
        {
            "optimized_tracks": [
                {
                    "track_index": 1,
                    "filter_type": "voice",
                    "clips": [
                        {
                            "clip_name": "interview.mp4",
                            "optimized_path": "/tmp/htr_optimized/voice_interview_mp4_0.wav",
                            "duration": 34.7
                        }
                    ]
                }
            ],
            "processing_time": 12.5,
            "output_directory": "/tmp/htr_optimized/"
        }

    Raises:
        FileNotFoundError: Source file not found
        ValueError: Invalid track data
        RuntimeError: Processing failed
    """
    start_time = time.time()
    created_files: List[Path] = []  # Intermediate files to cleanup
    optimized_results = []

    try:
        # Process each track
        for track in tracks:
            track_clips_results = []

            # Process each clip in track
            for clip_index, clip in enumerate(track.clips):
                extracted_audio = await resolve_clip_audio(clip, created_files)

                # Apply optimization (final file)
                optimized_audio = apply_optimization(
                    audio_path=extracted_audio,
                    filter_type=track.filter_type.value,
                    clip_name=clip.clip_name,
                    index=clip_index
                )
                # NOTE: optimized files are NOT added to created_files (must be preserved)

                # Get duration
                duration = get_audio_duration(optimized_audio)

                # Store result with timeline positions (absolute path)
                track_clips_results.append({
                    "clip_name": clip.clip_name,
                    "optimized_path": str(optimized_audio.resolve()),
                    "duration": duration,
                    "timeline_start": clip.timeline_start,
                    "timeline_end": clip.timeline_end
                })

            # Store track result
            optimized_results.append({
                "track_index": track.track_index,
                "filter_type": track.filter_type.value,
                "clips": track_clips_results
            })

        # Calculate processing time
        processing_time = time.time() - start_time

        # Return results (absolute path)
        output_dir = settings.temp_dir / "htr_optimized"
        return {
            "optimized_tracks": optimized_results,
            "processing_time": round(processing_time, 2),
            "output_directory": str(output_dir.resolve())
        }

    finally:
        # Cleanup ONLY intermediate extracted files (NOT optimized files)
        for file_path in created_files:
            try:
                if file_path.exists():
                    file_path.unlink()
                    logger.debug(f"Cleaned up intermediate file: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to cleanup {file_path}: {e}")
