#!/usr/bin/env python3
# app/core/services/audio/optimization.py

import json
import logging
import re
import subprocess
import uuid
from pathlib import Path
from typing import Dict, List, Optional

from config.config import settings
from app.core.utils.format import sanitize_filename

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def apply_optimization(
    audio_path: Path,
    filter_type: str,
    clip_name: str,
    index: int,
    track_index: int = 0,
    measured_params: Optional[Dict[str, float]] = None,
) -> Path:
    """
    Apply audio optimization to a single file.

    Prefer the two-pass workflow (measure_loudness → apply_optimization_chunk)
    for consistent results. This function is kept for backwards compatibility.

    Output format: WAV 48 kHz 24-bit stereo.
    """
    # Auto two-pass if no measured_params provided
    if not measured_params:
        measured_params = measure_loudness(audio_path)

    filter_chain = _get_filter_chain(filter_type, measured_params)

    # Add fade-out
    duration = _get_duration(audio_path)
    if duration and duration > 0.1:
        fade_out_start = max(0, duration - 0.05)
        filter_chain += f",afade=t=out:st={fade_out_start:.4f}:d=0.05"

    sanitized_name = sanitize_filename(clip_name).replace(".", "_")
    output_filename = f"{filter_type}_t{track_index}_{sanitized_name}_{index}.wav"
    output_dir = settings.temp_dir / "htr_optimized"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / output_filename

    _run_ffmpeg([
        "ffmpeg",
        "-i", str(audio_path),
        "-af", filter_chain,
        "-acodec", "pcm_s24le",
        "-ar", "48000",
        "-ac", "2",
        "-y",
        str(output_path),
    ])

    if not output_path.exists():
        raise RuntimeError(f"FFmpeg succeeded but output not found: {output_path}")
    return output_path


def apply_optimization_chunk(
    chunk_path: Path,
    filter_type: str,
    measured_params: Dict[str, float],
) -> Path:
    """Optimize a single chunk with fixed loudnorm params. Returns optimized chunk path."""
    filter_chain = _get_filter_chain(filter_type, measured_params)

    # Add fade-out (needs duration probe)
    duration = _get_duration(chunk_path)
    if duration and duration > 0.1:
        fade_out_start = max(0, duration - 0.05)
        filter_chain += f",afade=t=out:st={fade_out_start:.4f}:d=0.05"

    output_path = chunk_path.with_suffix(".opt.wav")
    _run_ffmpeg([
        "ffmpeg",
        "-i", str(chunk_path),
        "-af", filter_chain,
        "-acodec", "pcm_s24le",
        "-ar", "48000",
        "-ac", "2",
        "-y",
        str(output_path),
    ])

    if not output_path.exists():
        raise RuntimeError(f"FFmpeg chunk optimization failed: {output_path}")
    return output_path


# ---------------------------------------------------------------------------
# Loudness measurement (pass 1)
# ---------------------------------------------------------------------------

def measure_loudness(audio_path: Path) -> Dict[str, float]:
    """
    Run loudnorm first-pass to measure I / TP / LRA / thresh.
    Returns dict ready to inject into second-pass loudnorm filter.
    """
    result = subprocess.run(
        [
            "ffmpeg", "-i", str(audio_path),
            "-af", "loudnorm=print_format=json",
            "-f", "null", "-",
        ],
        capture_output=True, text=True, check=False,
    )

    # loudnorm JSON is printed to stderr
    stderr = result.stderr
    json_match = re.search(r"\{[^{}]+\}", stderr, re.DOTALL)
    if not json_match:
        raise RuntimeError(f"Failed to parse loudnorm output:\n{stderr[-500:]}")

    data = json.loads(json_match.group())
    return {
        "measured_I": float(data["input_i"]),
        "measured_TP": float(data["input_tp"]),
        "measured_LRA": float(data["input_lra"]),
        "measured_thresh": float(data["input_thresh"]),
    }


# ---------------------------------------------------------------------------
# Split / Concat
# ---------------------------------------------------------------------------

def split_audio(audio_path: Path, chunk_seconds: int) -> List[Path]:
    """
    Split *audio_path* into chunks of *chunk_seconds* using stream-copy (no re-encode → fast).
    Returns ordered list of chunk file paths.
    """
    uid = uuid.uuid4().hex[:8]
    chunk_dir = settings.temp_dir / "htr_chunks"
    chunk_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(chunk_dir / f"chunk_{uid}_%04d.wav")

    _run_ffmpeg([
        "ffmpeg",
        "-i", str(audio_path),
        "-f", "segment",
        "-segment_time", str(chunk_seconds),
        "-c", "copy",
        "-y",
        pattern,
    ])

    chunks = sorted(chunk_dir.glob(f"chunk_{uid}_*.wav"))
    if not chunks:
        raise RuntimeError(f"Split produced no chunks for {audio_path}")
    logger.info(f"[SPLIT] {audio_path.name} → {len(chunks)} chunks of ~{chunk_seconds}s")
    return chunks


def concat_chunks(chunk_paths: List[Path], output_path: Path) -> Path:
    """
    Concatenate ordered chunk files into a single WAV using ffmpeg concat demuxer (no re-encode).
    """
    list_file = output_path.with_suffix(".txt")
    list_file.write_text(
        "\n".join(f"file '{p}'" for p in chunk_paths),
        encoding="utf-8",
    )

    _run_ffmpeg([
        "ffmpeg",
        "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c", "copy",
        "-y",
        str(output_path),
    ])

    list_file.unlink(missing_ok=True)
    if not output_path.exists():
        raise RuntimeError(f"Concat failed — output not found: {output_path}")
    logger.info(f"[CONCAT] {len(chunk_paths)} chunks → {output_path.name}")
    return output_path


# ---------------------------------------------------------------------------
# Filter chains
# ---------------------------------------------------------------------------

_FILTER_TARGETS = {
    "voice":         {"I": -14, "TP": -1.5, "LRA": 11, "hpf": 80,   "compress": True},
    "music":         {"I": -14, "TP": -1.5, "LRA": 7,  "hpf": None, "compress": False},
    "sound_effects": {"I": -16, "TP": -1.5, "LRA": 15, "hpf": 60,   "compress": False},
}


def _get_filter_chain(
    filter_type: str,
    measured_params: Optional[Dict[str, float]] = None,
) -> str:
    """
    Build FFmpeg audio-filter chain.

    Chain order: resample → HPF → compressor (voice) → loudnorm → limiter → fade
    Always uses two-pass loudnorm with linear=true for consistent results.
    """
    targets = _FILTER_TARGETS.get(filter_type)
    if not targets:
        return "aresample=48000:resampler=soxr,alimiter=limit=-1.5dB:attack=5:release=50"

    parts: list[str] = []

    # High-quality resampling (safety net if input is not 48kHz)
    parts.append("aresample=48000:resampler=soxr")

    # Optional high-pass filter
    if targets["hpf"]:
        parts.append(f"highpass=f={targets['hpf']}")

    # Gentle dynamic range compression for voice (before loudnorm)
    # Soft knee + low ratio = transparent leveling, preserves natural dynamics
    if targets.get("compress"):
        parts.append("acompressor=threshold=0.05:ratio=2:attack=20:release=400:makeup=2:knee=8:link=0")

    # Loudnorm (two-pass with linear=true)
    ln = f"loudnorm=I={targets['I']}:TP={targets['TP']}:LRA={targets['LRA']}"
    if measured_params:
        ln += (
            f":measured_I={measured_params['measured_I']}"
            f":measured_TP={measured_params['measured_TP']}"
            f":measured_LRA={measured_params['measured_LRA']}"
            f":measured_thresh={measured_params['measured_thresh']}"
            f":linear=true"
        )
    parts.append(ln)

    # Safety-only limiter — should rarely engage (just catches extreme peaks)
    parts.append("alimiter=limit=-0.3dB:attack=10:release=100")

    # Micro-fades to prevent clicks at chunk boundaries (50ms in/out)
    parts.append("afade=t=in:st=0:d=0.05")

    return ",".join(parts)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_duration(audio_path: Path) -> Optional[float]:
    """Get audio duration in seconds via ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(audio_path)],
            capture_output=True, text=True, check=False,
        )
        return float(result.stdout.strip()) if result.stdout.strip() else None
    except (ValueError, FileNotFoundError):
        return None


def _run_ffmpeg(cmd: list[str]) -> subprocess.CompletedProcess:
    """Execute an ffmpeg command, raise RuntimeError on failure."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(
                f"FFmpeg failed:\nCmd: {' '.join(cmd)}\nError: {result.stderr[-1000:]}"
            )
        return result
    except FileNotFoundError:
        raise RuntimeError(
            "FFmpeg not found. Install: brew install ffmpeg (Mac) / apt-get install ffmpeg (Linux)"
        )
