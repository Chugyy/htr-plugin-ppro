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

logger = logging.getLogger(__name__)
from config.config import settings
from app.api.models.audio import (
    TranscriptionRequest,
    TranscriptionResponse,
    CorrectionRequest,
    CorrectionResponse,
    OptimizationRequest,
    OptimizationResponse
)
from app.core.jobs.transcription import extract_and_transcribe, correct_french
from app.core.services.queue import get_queue

router = APIRouter(prefix="/audio", tags=["audio"])


@router.post("/upload")
async def upload_audio(
    file: UploadFile = File(...),
    _: str = Depends(verify_api_key),
    _rl=Depends(check_rate_limit),
):
    """
    Upload a pre-extracted audio file for transcription.
    Returns the server-side path to pass in /audio/transcription with preextracted=true.
    """
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
    _: str = Depends(verify_api_key)
):
    """Download an optimized audio file produced by /audio/optimization."""
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
    _: str = Depends(verify_api_key),
    _rl=Depends(check_rate_limit),
):
    """
    Generate transcription from video clips

    1. Extract audio from each clip
    2. Combine clips respecting timeline
    3. Transcribe combined audio
    4. Return transcription JSON with metadata
    """
    logger.info(f"[TRANSCRIPTION] Request received: {len(request.clips)} clip(s)")
    for i, clip in enumerate(request.clips):
        logger.info(f"[TRANSCRIPTION] Clip {i+1}: {clip.clip_name} | preextracted={clip.preextracted} | path={clip.source_file_path}")

    t0 = time.time()
    try:
        queue = get_queue("transcription")
        task = await queue.submit(extract_and_transcribe, request.clips)
        result = task.result
        logger.info(f"[TRANSCRIPTION] Done in {time.time()-t0:.2f}s | words={result.get('word_count')} | duration={result.get('duration'):.2f}s")
        return TranscriptionResponse(**result)
    except FileNotFoundError as e:
        logger.error(f"[TRANSCRIPTION] FileNotFoundError: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        logger.error(f"[TRANSCRIPTION] ValueError: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.error(f"[TRANSCRIPTION] RuntimeError: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    except Exception as e:
        logger.exception(f"[TRANSCRIPTION] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.post("/correction", response_model=CorrectionResponse)
async def correct_transcription(
    request: CorrectionRequest,
    _: str = Depends(verify_api_key),
    _rl=Depends(check_rate_limit),
):
    """
    Correct French transcription using LLM

    Takes transcription JSON and applies orthographic/grammatical corrections
    """
    try:
        result = await correct_french(request.transcription_json)
        return CorrectionResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Correction failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.post("/optimization", response_model=OptimizationResponse)
async def optimize_audio(
    request: OptimizationRequest,
    _: str = Depends(verify_api_key),
    _rl=Depends(check_rate_limit),
):
    """
    Optimize audio tracks with filters based on type

    Applies audio optimization (normalization + limiter) to tracks:
    - Voice: HPF 80Hz + loudnorm -14 LUFS + limiter -1dB
    - Music: Loudnorm -14 LUFS + limiter -1dB
    - Sound effects: HPF 60Hz + loudnorm -16 LUFS + limiter -1dB

    Output format: WAV 48kHz 24-bit stereo
    """
    try:
        from app.core.jobs.optimization import optimize_tracks

        queue = get_queue("optimization")
        task = await queue.submit(optimize_tracks, request.tracks)
        result = task.result
        return OptimizationResponse(**result)

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
