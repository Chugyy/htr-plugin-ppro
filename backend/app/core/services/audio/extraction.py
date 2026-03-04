#!/usr/bin/env python3
# app/core/services/audio/extraction.py

import subprocess
from pathlib import Path
from typing import List
from config.config import settings
from app.core.utils.validation import validate_file_path, validate_time_range
from app.core.utils.format import generate_temp_filename, sanitize_filename
from .utils import get_audio_duration


class ClipTimelineInfo:
    """Info for positioning clip in timeline"""
    def __init__(
        self,
        audio_path: Path,
        clip_name: str,
        timeline_start: float,
        timeline_end: float
    ):
        self.audio_path = audio_path
        self.clip_name = clip_name
        self.timeline_start = timeline_start
        self.timeline_end = timeline_end
        self.duration = timeline_end - timeline_start


async def extract_audio_segment(
    source_path: str,
    in_point: float,
    out_point: float,
    clip_name: str
) -> Path:
    """
    Extract audio segment from video file using ffmpeg

    Args:
        source_path: Path to source media file (video)
        in_point: Start time in seconds
        out_point: End time in seconds
        clip_name: Name for output file

    Returns:
        Path to extracted audio file (.wav)

    Raises:
        FileNotFoundError: Source file not found
        ValueError: Invalid timecodes
        RuntimeError: FFmpeg execution failed
    """
    # Validation
    source_file = validate_file_path(source_path)
    in_point, out_point = validate_time_range(in_point, out_point)

    # Generate output path
    output_filename = generate_temp_filename(clip_name, ".wav")
    output_path = settings.temp_dir / output_filename

    # FFmpeg command
    # -ss AFTER -i = frame-accurate seeking (prevents timestamp drift)
    # -t = duration to extract
    duration = out_point - in_point

    cmd = [
        "ffmpeg",
        "-i", str(source_file),         # Input file
        "-ss", str(in_point),           # Seek to in_point (after -i for accuracy)
        "-t", str(duration),            # Duration to extract
        "-vn",                          # No video
        "-acodec", "pcm_s16le",         # WAV 16-bit PCM
        "-ar", "16000",                 # 16kHz sample rate (optimal for Whisper)
        "-ac", "1",                     # Mono
        "-y",                           # Overwrite without asking
        str(output_path)
    ]

    # Execute
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False  # Don't raise on non-zero exit
        )

        if result.returncode != 0:
            raise RuntimeError(
                f"FFmpeg extraction failed for {clip_name}:\n"
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


async def combine_audio_timeline(
    clips_info: List[ClipTimelineInfo],
    output_name: str = "combined_audio"
) -> Path:
    """
    Combine multiple audio clips respecting timeline positions

    Creates a final audio file with clips positioned exactly as in Premiere timeline,
    including silences/gaps between clips.

    Strategy: Concatenate clips with silence padding for gaps

    Args:
        clips_info: List of clips with timeline positions
        output_name: Name for output file

    Returns:
        Path to combined audio file

    Raises:
        ValueError: No clips provided
        RuntimeError: FFmpeg combination failed
    """
    if not clips_info:
        raise ValueError("No clips to combine")

    sorted_clips = sorted(clips_info, key=lambda c: c.timeline_start)

    # Create list of segments (clips + silences)
    segments = []
    current_time = 0.0

    for clip in sorted_clips:
        # Add silence if gap before this clip
        if clip.timeline_start > current_time:
            gap_duration = clip.timeline_start - current_time
            silence_path = await _create_silence(gap_duration, f"gap_{len(segments)}")
            segments.append(silence_path)

        # Add clip
        segments.append(clip.audio_path)
        current_time = clip.timeline_end

    # Concatenate all segments
    output_filename = sanitize_filename(output_name) + ".wav"
    output_path = settings.temp_dir / output_filename

    # Create concat file list with explicit durations to prevent timestamp drift
    concat_file = settings.temp_dir / f"concat_{output_name}.txt"
    with open(concat_file, 'w') as f:
        for i, segment in enumerate(segments):
            f.write(f"file '{segment.absolute()}'\n")
            # Add duration for all segments except the last one
            if i < len(segments) - 1:
                duration = get_audio_duration(segment)
                f.write(f"duration {duration}\n")
        # Last file must be listed again without duration (concat demuxer requirement)
        if segments:
            f.write(f"file '{segments[-1].absolute()}'\n")

    # FFmpeg concat with timestamp continuity preservation
    cmd = [
        "ffmpeg",
        "-f", "concat",
        "-safe", "0",
        "-i", str(concat_file),
        "-avoid_negative_ts", "make_non_negative",  # Ensure timestamp continuity
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, check=False)

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg concat failed: {result.stderr}")

    # Cleanup concat file
    concat_file.unlink(missing_ok=True)

    return output_path


async def _create_silence(duration: float, name: str) -> Path:
    """
    Create silent audio file of specified duration

    Args:
        duration: Duration in seconds
        name: Name for the silence file

    Returns:
        Path to silence file

    Raises:
        RuntimeError: FFmpeg failed to create silence
    """
    output_path = settings.temp_dir / f"silence_{sanitize_filename(name)}.wav"

    cmd = [
        "ffmpeg",
        "-f", "lavfi",
        "-i", f"anullsrc=r=16000:cl=mono:d={duration}",
        "-acodec", "pcm_s16le",
        "-y",
        str(output_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, check=False)

    if result.returncode != 0:
        raise RuntimeError(f"Failed to create silence: {result.stderr}")

    return output_path
