#!/usr/bin/env python3
# app/core/services/silence.py

import asyncio
import logging
import re
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


async def detect_silences(
    audio_path: str,
    noise_threshold: float = -30.0,
    min_duration: float = 0.5,
    timeline_offset: float = 0.0,
) -> Dict[str, Any]:
    """
    Detect silence regions in an audio file using ffmpeg silencedetect.

    Args:
        audio_path: Path to audio file
        noise_threshold: Volume threshold in dB below which audio is considered silence
        min_duration: Minimum silence duration in seconds
        timeline_offset: Offset to add to all timestamps

    Returns:
        Dict with silences list, total_silence_duration, audio_duration
    """
    # Get audio duration
    duration_cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        audio_path
    ]
    proc = await asyncio.create_subprocess_exec(
        *duration_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    audio_duration = float(stdout.decode().strip()) if stdout.decode().strip() else 0.0

    # Run silencedetect
    cmd = [
        "ffmpeg", "-i", audio_path,
        "-af", f"silencedetect=noise={noise_threshold}dB:d={min_duration}",
        "-f", "null", "-"
    ]

    logger.info(f"[SILENCE] Detecting silences: noise={noise_threshold}dB, min_duration={min_duration}s")

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    output = stderr.decode()

    # Parse ffmpeg output
    # [silencedetect @ 0x...] silence_start: 1.234
    # [silencedetect @ 0x...] silence_end: 2.567 | silence_duration: 1.333
    starts = re.findall(r"silence_start: ([\d.]+)", output)
    ends = re.findall(r"silence_end: ([\d.]+)", output)

    silences = []
    for i in range(min(len(starts), len(ends))):
        start = float(starts[i]) + timeline_offset
        end = float(ends[i]) + timeline_offset
        silences.append({
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(end - start, 3),
        })

    # Handle trailing silence (start without end = silence until EOF)
    if len(starts) > len(ends):
        start = float(starts[-1]) + timeline_offset
        end = audio_duration + timeline_offset
        silences.append({
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(end - start, 3),
        })

    total = sum(s["duration"] for s in silences)
    logger.info(f"[SILENCE] Found {len(silences)} silence(s), total {total:.1f}s / {audio_duration:.1f}s")

    return {
        "silences": silences,
        "total_silence_duration": round(total, 3),
        "audio_duration": round(audio_duration, 3),
    }
