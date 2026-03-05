#!/usr/bin/env python3
# app/core/jobs/utils.py

import logging
from pathlib import Path
from typing import List
from app.api.models.audio import AudioClipDTO
from app.core.services.audio import extract_audio_segment

logger = logging.getLogger(__name__)


async def resolve_clip_audio(clip: AudioClipDTO, created_files: List[Path]) -> Path:
    """
    Resolve the audio path for a clip.

    If preextracted=True, the file was already exported by AME and uploaded —
    use it directly. Otherwise, extract from source via ffmpeg.

    Always appends the resolved path to created_files for cleanup.
    """
    if clip.preextracted:
        audio_path = Path(clip.source_file_path)
        if not audio_path.exists():
            raise FileNotFoundError(f"Pre-extracted audio not found: {audio_path}")
        logger.info(f"[AUDIO] Pre-extracted: {clip.clip_name} → {audio_path.name} ({audio_path.stat().st_size / 1_048_576:.2f} MB)")
    else:
        logger.info(f"[AUDIO] Extracting: {clip.clip_name} ({clip.source_in_point:.2f}s → {clip.source_out_point:.2f}s)")
        audio_path = await extract_audio_segment(
            source_path=clip.source_file_path,
            in_point=clip.source_in_point,
            out_point=clip.source_out_point,
            clip_name=clip.clip_name
        )
        logger.info(f"[AUDIO] Extracted: {audio_path.name}")

    created_files.append(audio_path)
    return audio_path
