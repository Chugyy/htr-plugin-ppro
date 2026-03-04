#!/usr/bin/env python3
# app/api/routes/audio.py

from fastapi import APIRouter, Depends, HTTPException
from app.api.middleware.auth import verify_api_key
from app.api.models.audio import (
    TranscriptionRequest,
    TranscriptionResponse,
    CorrectionRequest,
    CorrectionResponse,
    OptimizationRequest,
    OptimizationResponse
)
from app.core.jobs.transcription import extract_and_transcribe, correct_french

router = APIRouter(prefix="/audio", tags=["audio"])


@router.post("/transcription", response_model=TranscriptionResponse)
async def generate_transcription(
    request: TranscriptionRequest,
    _: str = Depends(verify_api_key)
):
    """
    Generate transcription from video clips

    1. Extract audio from each clip
    2. Combine clips respecting timeline
    3. Transcribe combined audio
    4. Return transcription JSON with metadata
    """
    try:
        result = await extract_and_transcribe(request.clips)
        return TranscriptionResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.post("/correction", response_model=CorrectionResponse)
async def correct_transcription(
    request: CorrectionRequest,
    _: str = Depends(verify_api_key)
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
    _: str = Depends(verify_api_key)
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

        result = await optimize_tracks(request.tracks)
        return OptimizationResponse(**result)

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
