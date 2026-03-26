#!/usr/bin/env python3
# app/api/routes/audio.py

import shutil
import uuid
import logging
import time
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse
from app.api.middleware.auth import verify_api_key
from app.api.middleware.rate_limit import check_rate_limit
from app.database.crud.usage import track_usage

logger = logging.getLogger(__name__)
from config.config import settings
from app.api.models.audio import (
    TranscriptionRequest,
    TranscriptionResponse,
    CorrectionRequest,
    CorrectionResponse,
    OptimizationRequest,
    OptimizationResponse,
    SilenceDetectRequest,
    SilenceDetectResponse,
)
from app.core.jobs.transcription import extract_and_transcribe, correct_french
from app.core.services.silence import detect_silences
from app.core.services.queue import get_queue

router = APIRouter(prefix="/audio", tags=["audio"])


@router.post("/upload")
async def upload_audio(
    file: UploadFile = File(...),
    auth=Depends(verify_api_key()),  # auth only, no quota
    _rl=Depends(check_rate_limit),
):
    ext = Path(file.filename or "audio.wav").suffix or ".wav"
    dest_path = settings.temp_dir / f"upload_{uuid.uuid4().hex}{ext}"

    t0 = time.time()
    with dest_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    size_mb = dest_path.stat().st_size / 1_048_576
    logger.info(f"[UPLOAD] {file.filename} → {dest_path.name} ({size_mb:.2f} MB) in {time.time()-t0:.2f}s")
    return {"server_path": str(dest_path)}


@router.get("/download")
async def download_file(
    path: str,
    auth=Depends(verify_api_key()),  # auth only, no quota
):
    file_path = Path(path).resolve()
    if not str(file_path).startswith(str(settings.temp_dir.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    logger.info(f"[DOWNLOAD] {file_path.name} ({file_path.stat().st_size / 1_048_576:.2f} MB)")
    return FileResponse(file_path, media_type="audio/wav", filename=file_path.name)


@router.post("/transcription", response_model=TranscriptionResponse)
async def generate_transcription(
    request: TranscriptionRequest,
    auth=Depends(verify_api_key("transcription")),  # auth + quota check
    _rl=Depends(check_rate_limit),
):
    logger.info(f"[TRANSCRIPTION] Request received: {len(request.clips)} clip(s)")
    t0 = time.time()
    try:
        queue = get_queue("transcription")
        task = await queue.submit(extract_and_transcribe, request.clips, request.speaker_id, request.speaker_name)
        result = task.result
        await track_usage(auth.user_id, auth.api_key_id, "transcription")
        logger.info(f"[TRANSCRIPTION] Done in {time.time()-t0:.2f}s")
        return TranscriptionResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    except Exception as e:
        logger.exception(f"[TRANSCRIPTION] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.post("/correction", response_model=CorrectionResponse)
async def correct_transcription(
    request: CorrectionRequest,
    auth=Depends(verify_api_key("correction")),  # auth + quota check
    _rl=Depends(check_rate_limit),
):
    try:
        result = await correct_french(request.transcription_json)
        await track_usage(auth.user_id, auth.api_key_id, "correction")
        return CorrectionResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Correction failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.post("/silence-detect", response_model=SilenceDetectResponse)
async def silence_detect(
    request: SilenceDetectRequest,
    auth=Depends(verify_api_key("derushing")),  # auth + quota check
):
    audio_path = Path(request.audio_path)
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail=f"Audio file not found: {request.audio_path}")

    try:
        result = await detect_silences(
            str(audio_path),
            noise_threshold=request.noise_threshold,
            min_duration=request.min_duration,
            timeline_offset=request.timeline_offset,
        )
        await track_usage(auth.user_id, auth.api_key_id, "derushing")
        return SilenceDetectResponse(**result)
    except Exception as e:
        logger.exception(f"[SILENCE] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Silence detection failed: {str(e)}")


@router.post("/optimization", response_model=OptimizationResponse)
async def optimize_audio(
    request: OptimizationRequest,
    auth=Depends(verify_api_key("normalization")),  # auth + quota check
    _rl=Depends(check_rate_limit),
):
    try:
        from app.core.jobs.optimization import optimize_tracks

        queue = get_queue("optimization")
        task = await queue.submit(optimize_tracks, request.tracks)
        result = task.result
        await track_usage(auth.user_id, auth.api_key_id, "normalization")
        return OptimizationResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
