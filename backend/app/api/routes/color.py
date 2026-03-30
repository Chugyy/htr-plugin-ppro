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
    log_profile: str = "auto",
    auth=Depends(verify_api_key("color_corrections")),
    _rl=Depends(check_rate_limit),
):
    """Analyze a video frame and return Lumetri correction parameters.

    Args:
        log_profile: "auto" (detect LOG automatically), "none" (standard Rec.709),
                     or a specific profile: slog3, clog3, vlog, dlog, logc, braw, generic_log.
    """
    ext = Path(file.filename or "frame.png").suffix or ".png"
    frame_path = settings.temp_dir / f"color_{uuid.uuid4().hex}{ext}"

    try:
        content = await file.read()
        size_kb = len(content) / 1024
        logger.info(f"[COLOR] Received frame ({size_kb:.1f} KB), log_profile={log_profile}")

        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty frame file received")

        frame_path.write_bytes(content)
        result = analyze_frame(frame_path, log_profile=log_profile)

        log_info = result["log_detection"]
        logger.info(
            f"[COLOR] Analysis complete: log={log_info['is_log']} "
            f"(confidence={log_info['confidence']}, profile={log_info['estimated_profile']}), "
            f"exposure={result['corrections']['exposure']}, temp={result['corrections']['temperature']}"
        )

        await track_usage(auth.user_id, auth.api_key_id, "color_corrections")

        return result
    finally:
        if frame_path.exists():
            frame_path.unlink()
