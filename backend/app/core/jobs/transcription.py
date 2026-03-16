#!/usr/bin/env python3
# app/core/jobs/transcription.py

import logging
import time
from difflib import SequenceMatcher
from typing import List, Dict, Any
from pathlib import Path
from app.api.models.audio import AudioClipDTO
from app.core.services.audio import get_audio_duration
from app.core.services.transcription import transcribe_audio, adjust_timestamps_to_timeline
from app.core.services.smart_corrector import smart_correct_french
from app.core.jobs.utils import resolve_clip_audio

logger = logging.getLogger(__name__)


async def extract_and_transcribe(
    clips: List[AudioClipDTO],
    speaker_id: str | None = None,
    speaker_name: str | None = None,
) -> Dict[str, Any]:
    """
    Transcribe each clip individually then merge results.
    Each clip is sent to AssemblyAI independently (no combine) for precise timestamps.
    The clip's timeline_start is used as offset to place words at their real position.
    """
    created_files: List[Path] = []
    t_start = time.time()

    try:
        all_segments = []
        all_texts = []
        all_speakers = []
        total_word_count = 0
        max_duration = 0.0

        for i, clip in enumerate(clips):
            audio_path = await resolve_clip_audio(clip, created_files)

            logger.info(f"[JOB] Clip {i+1}/{len(clips)}: {clip.clip_name} | timeline={clip.timeline_start:.2f}s-{clip.timeline_end:.2f}s")

            # Transcribe this clip alone
            result = await transcribe_audio(
                str(audio_path), language="fr",
                speaker_id=speaker_id, speaker_name=speaker_name,
            )
            logger.info(f"[JOB] Clip {i+1} transcribed: {result.get('word_count')} words, {result.get('duration'):.2f}s")

            # Offset timestamps to timeline position
            adjusted = adjust_timestamps_to_timeline(result["premiere_json"], clip.timeline_start)

            all_segments.extend(adjusted.get("segments", []))
            all_texts.append(result["text"])
            total_word_count += result["word_count"]
            max_duration = max(max_duration, clip.timeline_end)

            # Collect speakers (deduplicate later)
            for spk in adjusted.get("speakers", []):
                if not any(s["id"] == spk["id"] for s in all_speakers):
                    all_speakers.append(spk)

        # Sort segments by timeline position
        all_segments.sort(key=lambda s: s.get("start", 0.0))

        # Build merged JSON
        merged_json: Dict[str, Any] = {
            "language": "fr-fr",
            "segments": all_segments,
            "speakers": all_speakers,
        }

        # Trim hallucinations
        video_end = max(clip.timeline_end for clip in clips)
        merged_json = _trim_transcript(merged_json, video_end)
        logger.info(f"[JOB] Merged: {len(merged_json['segments'])} segments | {total_word_count} words | {time.time()-t_start:.2f}s")

        return {
            "transcription_json": merged_json,
            "text": " ".join(all_texts),
            "duration": max_duration,
            "word_count": total_word_count,
        }

    finally:
        for file_path in created_files:
            try:
                if file_path.exists():
                    file_path.unlink()
            except Exception:
                pass


def _trim_transcript(premiere_json: Dict[str, Any], video_end: float) -> Dict[str, Any]:
    """
    Remove segments that are out-of-bounds or likely hallucinations.

    Rules:
    1. Hard cutoff: drop any segment starting more than 4s after video_end
    2. Duplicate detection: drop any segment whose text is ≥90% similar
       to the concatenation of all previously accepted segments
    """
    GRACE_SECONDS    = 4.0
    SIMILARITY_RATIO = 0.90
    cutoff = video_end + GRACE_SECONDS

    kept: List[Dict[str, Any]] = []
    seen_text = ""

    for seg in premiere_json.get("segments", []):
        seg_start: float = seg.get("start", 0.0)

        # Rule 1: hard time cutoff
        if seg_start > cutoff:
            logger.info(f"[TRIM] Dropped (out-of-bounds {seg_start:.2f}s > {cutoff:.2f}s): {seg.get('words', [{}])[0].get('text', '')[:40]}")
            continue

        # Rule 2: near-duplicate
        seg_text = " ".join(w.get("text", "") for w in seg.get("words", []) if w.get("type") == "word")
        if seen_text and seg_text:
            ratio = SequenceMatcher(None, seg_text.lower(), seen_text.lower()).ratio()
            if ratio >= SIMILARITY_RATIO:
                logger.info(f"[TRIM] Dropped (duplicate {ratio:.0%}): {seg_text[:60]}")
                continue

        kept.append(seg)
        seen_text = (seen_text + " " + seg_text).strip()

    result = premiere_json.copy()
    result["segments"] = kept
    return result


async def correct_french(transcription_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Correct French transcription using Grammalecte corrector

    Args:
        transcription_json: Transcription JSON with text or segments

    Returns:
        Dict with corrected_json, corrections_applied, model_used, errors_detected

    Raises:
        ValueError: Invalid JSON structure
        RuntimeError: Corrector service failed
    """
    # Extract text from JSON
    text = transcription_json.get("text")

    if not text:
        # Try to extract from segments
        segments = transcription_json.get("segments", [])
        if not segments:
            raise ValueError("No text found in transcription JSON")

        # Reconstruct text from segments
        text_parts = []
        for segment in segments:
            words = segment.get("words", [])
            segment_text = " ".join(w.get("text", "") for w in words)
            text_parts.append(segment_text)
        text = " ".join(text_parts)

    if not text.strip():
        raise ValueError("Empty text in transcription JSON")

    # Call smart corrector API (with pattern protection)
    try:
        correction_result = await smart_correct_french(text, format_text=False)
    except Exception as e:
        raise RuntimeError(f"Corrector service failed: {str(e)}")

    # Extract corrected text and errors
    corrected_text = correction_result["corrected_text"]
    grammar_errors = correction_result["grammar_errors"]
    spelling_errors = correction_result["spelling_errors"]
    total_corrections = len(grammar_errors)  # Count grammar corrections applied

    # Rebuild JSON with corrected text
    corrected_json = transcription_json.copy()
    corrected_json["text"] = corrected_text

    # Update segments if present - PRESERVE ORIGINAL TOKEN STRUCTURE
    if "segments" in corrected_json:
        # Extract only "word" type tokens (skip punctuation) for mapping
        original_text_words = []
        for segment in transcription_json["segments"]:
            for word in segment.get("words", []):
                if word.get("type") == "word":
                    original_text_words.append(word.get("text", ""))

        # Split corrected text (should have same word count if only spelling/grammar changed)
        corrected_words = corrected_text.split()

        # Safety check: warn if word count mismatch
        if len(corrected_words) != len(original_text_words):
            logger.warning(
                f"Word count mismatch after correction: "
                f"original={len(original_text_words)}, corrected={len(corrected_words)}. "
                f"Token mapping may be incorrect."
            )

        # Map corrected words back to original tokens
        word_index = 0
        for segment in corrected_json["segments"]:
            for word in segment.get("words", []):
                # Skip punctuation tokens - preserve them as-is
                if word.get("type") == "punctuation":
                    continue

                # Update word text while preserving ALL other properties
                if word_index < len(corrected_words):
                    word["text"] = corrected_words[word_index]
                    word_index += 1

    return {
        "corrected_json": corrected_json,
        "corrections_applied": total_corrections > 0,
        "model_used": "grammalecte",
        "errors_detected": {
            "grammar": len(grammar_errors),
            "spelling": len(spelling_errors),
            "total": len(grammar_errors) + len(spelling_errors)
        }
    }
