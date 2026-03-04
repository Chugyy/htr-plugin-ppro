#!/usr/bin/env python3
# app/core/utils/format.py

import re
import time

def sanitize_filename(name: str) -> str:
    """
    Sanitize filename (remove special chars and spaces)

    Args:
        name: Original filename

    Returns:
        Safe filename
    """
    # Remove/replace invalid chars
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', name)

    # Replace spaces with underscores (required for cross-platform compatibility)
    safe_name = safe_name.replace(' ', '_')

    # Remove leading/trailing underscores and dots
    safe_name = safe_name.strip('_.')

    # Limit length
    if len(safe_name) > 200:
        safe_name = safe_name[:200]

    # Fallback if empty
    if not safe_name:
        safe_name = "unnamed"

    return safe_name


def format_duration(seconds: float) -> str:
    """
    Format duration as HH:MM:SS or MM:SS

    Args:
        seconds: Duration in seconds

    Returns:
        Formatted string
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)

    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    else:
        return f"{minutes:02d}:{secs:02d}"


def generate_temp_filename(clip_name: str, suffix: str = ".wav") -> str:
    """
    Generate unique temp filename with timestamp

    Args:
        clip_name: Clip name
        suffix: File extension

    Returns:
        Filename with timestamp
    """
    safe_name = sanitize_filename(clip_name)
    timestamp = int(time.time() * 1000)
    return f"{safe_name}_{timestamp}{suffix}"
