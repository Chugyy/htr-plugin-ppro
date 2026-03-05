#!/usr/bin/env python3
# app/core/jobs/transcription.py

import logging
import time
from difflib import SequenceMatcher
from typing import List, Dict, Any
from pathlib import Path
from app.api.models.audio import AudioClipDTO
from app.core.services.audio import (
    extract_audio_segment,
    combine_audio_timeline,
    ClipTimelineInfo,
    get_audio_duration
)
from app.core.services.transcription import transcribe_audio, adjust_timestamps_to_timeline
from app.core.services.smart_corrector import smart_correct_french

logger = logging.getLogger(__name__)


async def extract_and_transcribe(clips: List[AudioClipDTO]) -> Dict[str, Any]:
    """
    Extract audio from clips, combine, transcribe and cleanup

    Args:
        clips: List of video clips with timeline info

    Returns:
        Dict with transcription_json, text, duration, word_count

    Raises:
        FileNotFoundError: Source file not found
        ValueError: Invalid clip data
        RuntimeError: Processing failed
    """
    created_files: List[Path] = []
    t_start = time.time()

    try:
        # Extract audio from each clip
        clips_info: List[ClipTimelineInfo] = []

        for clip in clips:
            if clip.preextracted:
                audio_path = Path(clip.source_file_path)
                logger.info(f"[JOB] Pre-extracted clip: {clip.clip_name} → {audio_path} (exists={audio_path.exists()}, size={audio_path.stat().st_size if audio_path.exists() else 'N/A'})")
                if not audio_path.exists():
                    raise FileNotFoundError(f"Pre-extracted audio not found: {audio_path}")
                created_files.append(audio_path)
            else:
                logger.info(f"[JOB] Extracting clip: {clip.clip_name} ({clip.source_in_point:.2f}s → {clip.source_out_point:.2f}s)")
                t = time.time()
                audio_path = await extract_audio_segment(
                    source_path=clip.source_file_path,
                    in_point=clip.source_in_point,
                    out_point=clip.source_out_point,
                    clip_name=clip.clip_name
                )
                logger.info(f"[JOB] Extraction done in {time.time()-t:.2f}s → {audio_path}")
                created_files.append(audio_path)

            clips_info.append(ClipTimelineInfo(
                audio_path=audio_path,
                clip_name=clip.clip_name,
                timeline_start=clip.timeline_start,
                timeline_end=clip.timeline_end
            ))

        # Calculate timeline offset (earliest clip start position)
        timeline_offset = min(clip.timeline_start for clip in clips)
        logger.info(f"[JOB] Timeline offset: {timeline_offset:.2f}s | clips: {len(clips_info)}")

        # Combine or use single audio
        if len(clips_info) == 1:
            final_audio_path = clips_info[0].audio_path
            logger.info(f"[JOB] Single clip — skipping combine")
        else:
            logger.info(f"[JOB] Combining {len(clips_info)} clips...")
            t = time.time()
            final_audio_path = await combine_audio_timeline(
                clips_info=clips_info,
                output_name="combined_timeline"
            )
            logger.info(f"[JOB] Combine done in {time.time()-t:.2f}s → {final_audio_path}")
            created_files.append(final_audio_path)

        final_size_mb = final_audio_path.stat().st_size / 1_048_576
        logger.info(f"[JOB] Sending to AssemblyAI: {final_audio_path.name} ({final_size_mb:.2f} MB)")
        t = time.time()
        # Transcribe
        result = await transcribe_audio(str(final_audio_path), language="fr")
        logger.info(f"[JOB] AssemblyAI done in {time.time()-t:.2f}s | words={result.get('word_count')} | duration={result.get('duration'):.2f}s")

        # Adjust timestamps to match Premiere timeline positions
        adjusted_json = adjust_timestamps_to_timeline(
            result["premiere_json"],
            timeline_offset
        )

        # Trim hallucinations and out-of-bounds segments
        video_end = max(clip.timeline_end for clip in clips)
        adjusted_json = _trim_transcript(adjusted_json, video_end)
        logger.info(f"[JOB] After trim: {len(adjusted_json.get('segments', []))} segments | video_end={video_end:.2f}s")

        # Verify duration consistency (drift detection)
        audio_duration = get_audio_duration(final_audio_path)
        transcript_duration = result["duration"]

        # Log warning if duration mismatch > 1% (indicates potential drift)
        if audio_duration > 0:
            duration_diff_percent = abs(audio_duration - transcript_duration) / audio_duration
            if duration_diff_percent > 0.01:
                logger.warning(
                    f"Duration mismatch detected: "
                    f"audio={audio_duration:.2f}s, "
                    f"transcript={transcript_duration:.2f}s, "
                    f"diff={duration_diff_percent*100:.2f}%"
                )

        # Return formatted result
        logger.info(f"[JOB] Total job time: {time.time()-t_start:.2f}s")
        return {
            "transcription_json": adjusted_json,
            "text": result["text"],
            "duration": result["duration"],
            "word_count": result["word_count"]
        }

    finally:
        # Cleanup all created files
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
