#!/usr/bin/env python3
# app/core/services/color.py

"""
Color analysis service — pure function, no I/O besides reading the image file.
Analyzes a frame and returns Lumetri-compatible correction values.
Supports automatic LOG footage detection with per-profile corrections.
"""

import cv2
import numpy as np
from pathlib import Path


# ── LOG profile presets ────────────────────────────────────
# Each profile defines correction multipliers calibrated to convert
# that specific LOG curve toward Rec.709-like appearance via Lumetri params.

LOG_PROFILES: dict[str, dict] = {
    # Strategy: LOG raises shadows/blacks to preserve detail. To convert back
    # to Rec.709, we CRUSH blacks/shadows back down, pull whites down, add
    # moderate contrast, and keep saturation near neutral.
    # Calibrated against Premiere Pro's own auto-correction as reference.
    "slog3": {
        "name": "S-Log3 (Sony)",
        "exposure_boost": 0.4,
        "contrast_boost": 30,
        "saturation_target": 102,
        "vibrance_boost": 5,
        "shadow_crush": -36,
        "highlight_adjust": 6,
        "whites_adjust": -22,
        "blacks_crush": -38,
        "wb_strength": 0.4,
    },
    "clog3": {
        "name": "C-Log3 (Canon)",
        "exposure_boost": 0.5,
        "contrast_boost": 28,
        "saturation_target": 105,
        "vibrance_boost": 5,
        "shadow_crush": -30,
        "highlight_adjust": 5,
        "whites_adjust": -18,
        "blacks_crush": -32,
        "wb_strength": 0.35,
    },
    "vlog": {
        "name": "V-Log (Panasonic)",
        "exposure_boost": 0.4,
        "contrast_boost": 32,
        "saturation_target": 103,
        "vibrance_boost": 5,
        "shadow_crush": -34,
        "highlight_adjust": 5,
        "whites_adjust": -20,
        "blacks_crush": -36,
        "wb_strength": 0.4,
    },
    "dlog": {
        "name": "D-Log (DJI)",
        "exposure_boost": 0.5,
        "contrast_boost": 25,
        "saturation_target": 105,
        "vibrance_boost": 5,
        "shadow_crush": -25,
        "highlight_adjust": 5,
        "whites_adjust": -15,
        "blacks_crush": -28,
        "wb_strength": 0.35,
    },
    "logc": {
        "name": "LogC (ARRI)",
        "exposure_boost": 0.3,
        "contrast_boost": 30,
        "saturation_target": 102,
        "vibrance_boost": 5,
        "shadow_crush": -35,
        "highlight_adjust": 5,
        "whites_adjust": -20,
        "blacks_crush": -36,
        "wb_strength": 0.35,
    },
    "braw": {
        "name": "Blackmagic Film",
        "exposure_boost": 0.4,
        "contrast_boost": 28,
        "saturation_target": 103,
        "vibrance_boost": 5,
        "shadow_crush": -30,
        "highlight_adjust": 5,
        "whites_adjust": -18,
        "blacks_crush": -32,
        "wb_strength": 0.35,
    },
    "generic_log": {
        "name": "Generic LOG",
        "exposure_boost": 0.4,
        "contrast_boost": 30,
        "saturation_target": 103,
        "vibrance_boost": 5,
        "shadow_crush": -32,
        "highlight_adjust": 5,
        "whites_adjust": -18,
        "blacks_crush": -34,
        "wb_strength": 0.4,
    },
}


def analyze_frame(image_path: str | Path, log_profile: str = "auto") -> dict:
    """Analyze an image and return Lumetri correction parameters.

    Args:
        image_path: Path to PNG/JPG frame.
        log_profile: "auto" (detect), "none" (standard Rec.709),
                     or a profile key from LOG_PROFILES.
    """
    img = cv2.imread(str(image_path))
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    diagnostics = _compute_diagnostics(img)
    log_detection = _detect_log(img, diagnostics, log_profile)
    corrections = _compute_corrections(diagnostics, log_detection)
    return {
        "diagnostics": diagnostics,
        "log_detection": log_detection,
        "corrections": corrections,
    }


def _compute_diagnostics(img: np.ndarray) -> dict:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float64)
    l, a, b = cv2.split(lab)

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    total_px = l.size

    # Histogram concentration in midtones (LOG signature)
    l_norm = l / 255.0
    midtone_pct = float(np.sum((l_norm > 0.25) & (l_norm < 0.75)) / total_px * 100)

    return {
        "luminance_mean": round(float(np.mean(l)), 1),
        "luminance_std": round(float(np.std(l)), 1),
        "a_shift": round(float(np.mean(a) - 128), 1),
        "b_shift": round(float(np.mean(b) - 128), 1),
        "saturation_mean": round(float(np.mean(hsv[:, :, 1])), 1),
        "clipped_highlights_pct": round(float(np.sum(l > 250) / total_px * 100), 1),
        "crushed_shadows_pct": round(float(np.sum(l < 5) / total_px * 100), 1),
        "midtone_concentration_pct": round(midtone_pct, 1),
    }


def _detect_log(img: np.ndarray, diag: dict, log_profile: str) -> dict:
    """Detect if footage is LOG-encoded based on histogram analysis."""
    # Forced profile → skip detection
    if log_profile != "auto":
        is_forced = log_profile in LOG_PROFILES
        return {
            "is_log": is_forced,
            "confidence": 1.0 if is_forced else 0.0,
            "estimated_profile": log_profile if is_forced else "none",
            "forced": True,
        }

    # Heuristic scoring (0–100)
    score = 0.0

    # Low contrast is the strongest LOG indicator
    l_std = diag["luminance_std"]
    if l_std < 25:
        score += 35
    elif l_std < 35:
        score += 25
    elif l_std < 45:
        score += 10

    # Low saturation
    sat = diag["saturation_mean"]
    if sat < 30:
        score += 25
    elif sat < 45:
        score += 18
    elif sat < 60:
        score += 8

    # High midtone concentration (LOG compresses everything into midtones)
    mid_pct = diag["midtone_concentration_pct"]
    if mid_pct > 85:
        score += 25
    elif mid_pct > 75:
        score += 18
    elif mid_pct > 65:
        score += 8

    # Almost no clipping (LOG preserves extremes)
    if diag["clipped_highlights_pct"] < 0.5 and diag["crushed_shadows_pct"] < 0.5:
        score += 15
    elif diag["clipped_highlights_pct"] < 2 and diag["crushed_shadows_pct"] < 2:
        score += 8

    confidence = round(min(score / 100, 1.0), 2)
    is_log = confidence >= 0.55

    return {
        "is_log": is_log,
        "confidence": confidence,
        "estimated_profile": "generic_log" if is_log else "none",
        "forced": False,
    }


def _compute_corrections(diag: dict, log_detection: dict) -> dict:
    """Map diagnostics to Lumetri parameter values.
    Uses LOG-specific aggressive corrections when LOG is detected."""

    is_log = log_detection["is_log"]
    profile_key = log_detection["estimated_profile"]
    profile = LOG_PROFILES.get(profile_key) if is_log else None

    if profile:
        return _compute_log_corrections(diag, profile)
    return _compute_standard_corrections(diag)


def _compute_log_corrections(diag: dict, profile: dict) -> dict:
    """Convert LOG → Rec.709 by reversing what LOG does: crush shadows/blacks
    back down, pull whites down, add moderate contrast. Keep saturation near
    neutral — LOG desaturation is a gamma artifact that resolves with proper
    tonal correction, not by cranking saturation.
    """
    l_mean = diag["luminance_mean"]
    wb_str = profile["wb_strength"]

    temperature = round(-diag["b_shift"] * wb_str, 1)
    tint = round(-diag["a_shift"] * wb_str, 1)

    # Exposure: very gentle, adaptive to actual brightness
    base_expo = profile["exposure_boost"]
    if l_mean < 100:
        exposure = round(min(base_expo + 0.3, 1.2), 2)
    elif l_mean > 150:
        exposure = round(base_expo * 0.3, 2)
    else:
        exposure = round(base_expo, 2)

    contrast = profile["contrast_boost"]
    shadows = profile["shadow_crush"]
    highlights = profile["highlight_adjust"]
    whites = profile["whites_adjust"]
    blacks = profile["blacks_crush"]

    saturation = profile["saturation_target"]
    vibrance = profile["vibrance_boost"]

    return {
        "temperature": temperature,
        "tint": tint,
        "exposure": exposure,
        "contrast": contrast,
        "highlights": highlights,
        "shadows": shadows,
        "whites": whites,
        "blacks": blacks,
        "saturation": saturation,
        "vibrance": vibrance,
    }


def _compute_standard_corrections(diag: dict) -> dict:
    """Standard Rec.709 corrections (original behavior)."""
    temperature = round(-diag["b_shift"] * 0.3, 1)
    tint = round(-diag["a_shift"] * 0.3, 1)

    l_mean = diag["luminance_mean"]
    l_std = diag["luminance_std"]
    underexposed = l_mean < 100
    low_contrast = l_std < 40
    desaturated = diag["saturation_mean"] < 50

    if underexposed:
        exposure = round(min((128 - l_mean) / 128 * 2.0, 3.0), 2)
    elif l_mean > 170:
        exposure = round(max((128 - l_mean) / 128 * 1.5, -2.0), 2)
    else:
        exposure = 0.0

    contrast = 15 if low_contrast else 5 if l_std < 55 else 0
    highlights = -10 if diag["clipped_highlights_pct"] > 2 else 0
    shadows = 15 if underexposed else 5 if diag["crushed_shadows_pct"] > 3 else 0
    whites = -5 if diag["clipped_highlights_pct"] > 5 else 0
    blacks = 5 if diag["crushed_shadows_pct"] > 5 else 0

    if desaturated:
        saturation = 115
    else:
        saturation = 100

    vibrance = 15 if desaturated else 8 if diag["saturation_mean"] < 70 else 0

    return {
        "temperature": temperature,
        "tint": tint,
        "exposure": exposure,
        "contrast": contrast,
        "highlights": highlights,
        "shadows": shadows,
        "whites": whites,
        "blacks": blacks,
        "saturation": saturation,
        "vibrance": vibrance,
    }
