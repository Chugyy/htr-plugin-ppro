#!/usr/bin/env python3
# app/core/services/audio/optimization.py

import subprocess
from pathlib import Path
from config.config import settings
from app.core.utils.format import sanitize_filename


def apply_optimization(audio_path: Path, filter_type: str, clip_name: str, index: int) -> Path:
    """
    Apply audio optimization (normalization + limiter) based on filter type

    Based on audio-best-practises.md recommendations:
    - Voice: Target -10 dB RMS, peaks at -3 dB max
    - Music: Target -10 dB RMS, peaks at -3 dB max
    - Sound effects: Variable levels based on type, peaks at -3 dB max

    Output format: WAV 48kHz 24-bit stereo

    Args:
        audio_path: Path to input audio file
        filter_type: Type of filter (voice/music/sound_effects)
        clip_name: Original clip name for output naming
        index: Index for unique naming

    Returns:
        Path to optimized audio file

    Raises:
        RuntimeError: FFmpeg optimization failed
    """
    # Get filter chain
    filter_chain = _get_filter_chain(filter_type)

    # Generate output path
    sanitized_name = sanitize_filename(clip_name).replace(".", "_")
    output_filename = f"{filter_type}_{sanitized_name}_{index}.wav"
    output_dir = settings.temp_dir / "htr_optimized"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / output_filename

    # FFmpeg command with optimization filters
    cmd = [
        "ffmpeg",
        "-i", str(audio_path),
        "-af", filter_chain,
        "-acodec", "pcm_s24le",  # 24-bit PCM
        "-ar", "48000",          # 48kHz (standard video)
        "-ac", "2",              # Stereo
        "-y",
        str(output_path)
    ]

    # Execute
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"FFmpeg optimization failed:\n"
                f"Command: {' '.join(cmd)}\n"
                f"Error: {result.stderr}"
            )

        # Verify output exists
        if not output_path.exists():
            raise RuntimeError(f"FFmpeg succeeded but output file not found: {output_path}")

        return output_path

    except FileNotFoundError:
        raise RuntimeError(
            "FFmpeg not found. Please install ffmpeg:\n"
            "Mac: brew install ffmpeg\n"
            "Linux: apt-get install ffmpeg"
        )


def _get_filter_chain(filter_type: str) -> str:
    """
    Get FFmpeg filter chain based on filter type

    Filters applied (in order):
    1. High-pass filter (remove low-frequency noise)
    2. Loudness normalization (LUFS targeting)
    3. Limiter (prevent clipping, ensure headroom)

    Best practices from audio-best-practises.md:
    - Voice: -10 dB average, -3 dB peak, HPF at 80-100 Hz
    - Music: -10 dB average, -3 dB peak
    - Sound effects: Variable levels, -3 dB peak
    - Target -14 LUFS for platform compliance

    Args:
        filter_type: Type of filter (voice/music/sound_effects)

    Returns:
        FFmpeg filter chain string
    """
    if filter_type == "voice":
        # Voice optimization:
        # - HPF at 80 Hz (remove rumble/handling noise)
        # - Loudness normalization to -14 LUFS (platform standard)
        # - Limiter at -1 dB (safety headroom)
        return "highpass=f=80,loudnorm=I=-14:TP=-1:LRA=11,alimiter=limit=-1dB:attack=5:release=50"

    elif filter_type == "music":
        # Music optimization:
        # - Loudness normalization to -14 LUFS (platform standard)
        # - Limiter at -1 dB (safety headroom)
        # - No HPF (preserve low frequencies for bass/kick)
        return "loudnorm=I=-14:TP=-1:LRA=7,alimiter=limit=-1dB:attack=5:release=50"

    elif filter_type == "sound_effects":
        # Sound effects optimization:
        # - Moderate loudness normalization to -16 LUFS (slightly lower for mixing)
        # - Limiter at -1 dB (safety headroom)
        # - HPF at 60 Hz (optional, preserve some low-end for impacts)
        return "highpass=f=60,loudnorm=I=-16:TP=-1:LRA=15,alimiter=limit=-1dB:attack=5:release=50"

    else:
        # Fallback: basic limiter only
        return "alimiter=limit=-1dB:attack=5:release=50"
