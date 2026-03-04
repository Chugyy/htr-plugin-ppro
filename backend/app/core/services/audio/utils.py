#!/usr/bin/env python3
# app/core/services/audio/utils.py

import subprocess
from pathlib import Path


def get_audio_duration(audio_path: Path) -> float:
    """
    Get exact audio duration using ffprobe

    Args:
        audio_path: Path to audio file

    Returns:
        Duration in seconds

    Raises:
        RuntimeError: FFprobe failed
    """
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(audio_path)
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)

        if result.returncode != 0:
            raise RuntimeError(f"FFprobe failed: {result.stderr}")

        return float(result.stdout.strip())

    except FileNotFoundError:
        raise RuntimeError(
            "FFprobe not found. Please install ffmpeg:\n"
            "Mac: brew install ffmpeg\n"
            "Linux: apt-get install ffmpeg"
        )
    except ValueError as e:
        raise RuntimeError(f"Failed to parse duration: {e}")
