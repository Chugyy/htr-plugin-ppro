#!/usr/bin/env python3
# app/api/routes/color.py

import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File
from app.api.middleware.auth import verify_api_key
from app.api.middleware.rate_limit import check_rate_limit
from app.database.crud.usage import track_usage
from app.api.models.color import ColorAnalysisResponse
from app.core.services.color import analyze_frame
from config.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/color", tags=["color"])


@router.post("/analyze", response_model=ColorAnalysisResponse)
async def analyze_color(
    file: UploadFile = File(..., description="PNG/JPG frame to analyze"),
    auth=Depends(verify_api_key("color_corrections")),
    _rl=Depends(check_rate_limit),
):
    """Analyze a video frame and return Lumetri correction parameters."""
    ext = Path(file.filename or "frame.png").suffix or ".png"
    frame_path = settings.temp_dir / f"color_{uuid.uuid4().hex}{ext}"

    try:
        # Save uploaded frame
        content = await file.read()
        frame_path.write_bytes(content)
        size_kb = len(content) / 1024
        logger.info(f"[COLOR] Received frame ({size_kb:.1f} KB)")

        # Analyze
        result = analyze_frame(frame_path)
        logger.info(f"[COLOR] Analysis complete: exposure={result['corrections']['exposure']}, temp={result['corrections']['temperature']}")

        # Track usage
        await track_usage(auth.user_id, auth.api_key_id, "color_corrections")

        return result
    finally:
        # Cleanup: always remove the uploaded frame
        if frame_path.exists():
            frame_path.unlink()
