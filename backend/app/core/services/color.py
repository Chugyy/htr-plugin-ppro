#!/usr/bin/env python3
# app/core/services/color.py

"""
Color analysis service — pure function, no I/O besides reading the image file.
Analyzes a frame and returns Lumetri-compatible correction values.
"""

import cv2
import numpy as np
from pathlib import Path


def analyze_frame(image_path: str | Path) -> dict:
    """Analyze an image and return Lumetri correction parameters.

    Returns dict with keys matching Premiere Pro Lumetri Basic Correction:
    temperature, tint, exposure, contrast, highlights, shadows,
    whites, blacks, saturation, vibrance.
    """
    img = cv2.imread(str(image_path))
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    diagnostics = _compute_diagnostics(img)
    corrections = _compute_corrections(img, diagnostics)
    return {"diagnostics": diagnostics, "corrections": corrections}


def _compute_diagnostics(img: np.ndarray) -> dict:
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float64)
    l, a, b = cv2.split(lab)

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    total_px = l.size

    return {
        "luminance_mean": round(float(np.mean(l)), 1),
        "luminance_std": round(float(np.std(l)), 1),
        "a_shift": round(float(np.mean(a) - 128), 1),
        "b_shift": round(float(np.mean(b) - 128), 1),
        "saturation_mean": round(float(np.mean(hsv[:, :, 1])), 1),
        "clipped_highlights_pct": round(float(np.sum(l > 250) / total_px * 100), 1),
        "crushed_shadows_pct": round(float(np.sum(l < 5) / total_px * 100), 1),
    }


def _compute_corrections(img: np.ndarray, diag: dict) -> dict:
    """Map diagnostics to Lumetri parameter values."""
    # White balance: partial correction (30%) to keep scene character
    # Premiere Temperature: positive = warm, negative = cool
    # Our b_shift: positive = too warm → correct with negative
    temperature = round(-diag["b_shift"] * 0.3, 1)
    tint = round(-diag["a_shift"] * 0.3, 1)

    # Exposure: target luminance ~128
    l_mean = diag["luminance_mean"]
    l_std = diag["luminance_std"]
    underexposed = l_mean < 100
    low_contrast = l_std < 40
    desaturated = diag["saturation_mean"] < 50

    # Premiere Exposure range: roughly -4.0 to +4.0
    # Map luminance delta to that range
    if underexposed:
        exposure = round(min((128 - l_mean) / 128 * 2.0, 3.0), 2)
    elif l_mean > 170:
        exposure = round(max((128 - l_mean) / 128 * 1.5, -2.0), 2)
    else:
        exposure = 0.0

    # Contrast: boost if flat
    contrast = 15 if low_contrast else 5 if l_std < 55 else 0

    # Shadows/Highlights recovery
    highlights = -10 if diag["clipped_highlights_pct"] > 2 else 0
    shadows = 15 if underexposed else 5 if diag["crushed_shadows_pct"] > 3 else 0

    # Whites/Blacks: subtle adjustments
    whites = -5 if diag["clipped_highlights_pct"] > 5 else 0
    blacks = 5 if diag["crushed_shadows_pct"] > 5 else 0

    # Saturation: Premiere default is 100 (no change)
    if desaturated:
        saturation = 115
    else:
        saturation = 100

    # Vibrance: boost weak colors
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
