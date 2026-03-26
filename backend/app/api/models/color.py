#!/usr/bin/env python3
# app/api/models/color.py

from pydantic import Field
from app.api.models.common import BaseSchema


class LumetriCorrections(BaseSchema):
    """Lumetri Color Basic Correction parameters."""
    temperature: float = Field(..., description="White balance temperature")
    tint: float = Field(..., description="White balance tint")
    exposure: float = Field(..., description="Exposure adjustment")
    contrast: float = Field(..., description="Contrast adjustment")
    highlights: float = Field(..., description="Highlights recovery")
    shadows: float = Field(..., description="Shadows lift")
    whites: float = Field(..., description="Whites adjustment")
    blacks: float = Field(..., description="Blacks adjustment")
    saturation: float = Field(..., description="Saturation (100 = neutral)")
    vibrance: float = Field(..., description="Vibrance boost")


class ColorDiagnostics(BaseSchema):
    """Image analysis diagnostics."""
    luminance_mean: float
    luminance_std: float
    a_shift: float
    b_shift: float
    saturation_mean: float
    clipped_highlights_pct: float
    crushed_shadows_pct: float


class ColorAnalysisResponse(BaseSchema):
    """Response from color analysis endpoint."""
    diagnostics: ColorDiagnostics
    corrections: LumetriCorrections
