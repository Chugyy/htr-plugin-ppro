#!/usr/bin/env python3
# app/core/utils/validation.py

from pathlib import Path

def validate_file_path(path: str) -> Path:
    """
    Validate file path exists and is readable

    Args:
        path: File path string

    Returns:
        Path object

    Raises:
        FileNotFoundError: If file doesn't exist
        ValueError: If path is not a file
        PermissionError: If file not readable
    """
    file_path = Path(path)

    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    if not file_path.is_file():
        raise ValueError(f"Path is not a file: {path}")

    # Test read permission
    try:
        file_path.open('rb').close()
    except PermissionError:
        raise PermissionError(f"Cannot read file: {path}")

    return file_path


def validate_timecode(seconds: float, label: str = "Timecode") -> float:
    """
    Validate timecode value is positive

    Args:
        seconds: Time in seconds
        label: Label for error message

    Returns:
        Validated seconds

    Raises:
        ValueError: If negative timecode
    """
    if seconds < 0:
        raise ValueError(f"{label} must be positive, got {seconds}")

    return seconds


def validate_time_range(in_point: float, out_point: float) -> tuple[float, float]:
    """
    Validate time range (in < out)

    Args:
        in_point: Start time
        out_point: End time

    Returns:
        Tuple (in_point, out_point)

    Raises:
        ValueError: If in_point >= out_point
    """
    validate_timecode(in_point, "In point")
    validate_timecode(out_point, "Out point")

    if in_point >= out_point:
        raise ValueError(f"In point ({in_point}) must be < out point ({out_point})")

    return in_point, out_point
