#!/usr/bin/env python3
# app/core/services/transcription.py

import assemblyai as aai
import uuid
import string
from pathlib import Path
from typing import Dict, Any, List
from config.config import settings
from app.core.utils.validation import validate_file_path


def adjust_timestamps_to_timeline(premiere_json: Dict[str, Any], timeline_offset: float) -> Dict[str, Any]:
    """
    Adjust all timestamps in Premiere JSON to match timeline positions

    Args:
        premiere_json: Premiere Pro format transcription
        timeline_offset: Timeline start offset in seconds

    Returns:
        Adjusted Premiere JSON with timeline-relative timestamps
    """
    adjusted = premiere_json.copy()

    for segment in adjusted.get("segments", []):
        segment["start"] += timeline_offset

        for word in segment.get("words", []):
            word["start"] += timeline_offset

    return adjusted


def configure_assemblyai():
    """Configure AssemblyAI with API key from settings"""
    aai.settings.api_key = settings.assemblyai_api_key


def convert_to_premiere_format(transcript: aai.Transcript, language: str = "fr-fr") -> Dict[str, Any]:
    """
    Convert AssemblyAI transcript to Premiere Pro JSON format

    Args:
        transcript: AssemblyAI Transcript object
        language: Language code (default: fr-fr)

    Returns:
        Dictionary in Premiere Pro transcript format
    """
    # Generate UUID for default speaker
    default_speaker_id = str(uuid.uuid4())

    premiere_format = {
        "language": language,
        "segments": [],
        "speakers": []
    }

    # Group words into segments (by sentence or time window)
    if not transcript.words:
        return premiere_format

    # Create one segment per sentence or group of words
    current_segment = None
    segment_words = []

    for word in transcript.words:
        # Start new segment if needed
        if current_segment is None:
            current_segment = {
                "duration": 0,
                "language": language,
                "speaker": default_speaker_id,
                "start": word.start / 1000.0,  # Convert ms to seconds
                "words": []
            }

        # Calculate word duration and detect end of sentence
        word_duration = (word.end - word.start) / 1000.0  # Convert ms to seconds
        is_sentence_end = word.text.strip().endswith(('.', '!', '?', ';'))

        # Detect if punctuation or word
        is_punctuation = word.text.strip() in string.punctuation
        word_type = "punctuation" if is_punctuation else "word"

        # Add word to segment with all required fields
        segment_words.append({
            "confidence": word.confidence if hasattr(word, 'confidence') else 1.0,
            "duration": word_duration,
            "eos": is_sentence_end,
            "start": word.start / 1000.0,  # Convert ms to seconds
            "tags": [],
            "text": word.text,
            "type": word_type
        })

        # Check if we should close this segment (end of sentence or max duration)
        segment_duration = (word.end / 1000.0) - current_segment["start"]

        if is_sentence_end or segment_duration > 10.0:  # Max 10s per segment
            # Finalize segment
            current_segment["words"] = segment_words
            current_segment["duration"] = segment_duration
            premiere_format["segments"].append(current_segment)

            # Reset for next segment
            current_segment = None
            segment_words = []

    # Add last segment if exists
    if current_segment is not None and segment_words:
        last_word = transcript.words[-1]
        current_segment["words"] = segment_words
        current_segment["duration"] = (last_word.end / 1000.0) - current_segment["start"]
        premiere_format["segments"].append(current_segment)

    # Populate speakers array
    premiere_format["speakers"] = [
        {
            "id": default_speaker_id,
            "name": "Speaker 1"
        }
    ]

    return premiere_format


async def transcribe_audio(audio_path: str, language: str = "fr") -> Dict[str, Any]:
    """
    Transcribe audio file using AssemblyAI and return Premiere Pro compatible JSON

    Args:
        audio_path: Path to audio file (.wav, .mp3, etc.)
        language: Language code (fr, en, es, etc.)

    Returns:
        Dictionary containing:
        - text (str): Full transcription text
        - premiere_json (dict): Premiere Pro compatible JSON format
        - duration (float): Audio duration in seconds
        - word_count (int): Number of words transcribed
        - language_detected (str): Detected language code

        Example response structure:
        {
            "text": "Bonjour, comment allez-vous aujourd'hui?",
            "premiere_json": {
                "language": "fr-fr",
                "segments": [
                    {
                        "start": 0.031,
                        "duration": 3.14,
                        "speaker": "default-speaker",
                        "words": [
                            {
                                "text": "Bonjour,",
                                "start": 0.031,
                                "confidence": 0.98,
                                "type": "word"
                            },
                            {
                                "text": "comment",
                                "start": 0.811,
                                "confidence": 0.95,
                                "type": "word"
                            }
                        ]
                    }
                ],
                "speakers": []
            },
            "duration": 121.69,
            "word_count": 374,
            "language_detected": "fr"
        }

        Usage example:
            result = await transcribe_audio("audio.wav", "fr")
            full_text = result["text"]
            premiere_format = result["premiere_json"]
            total_duration = result["duration"]

    Raises:
        FileNotFoundError: Audio file not found
        RuntimeError: Transcription failed
    """
    # Validate audio file exists
    audio_file = validate_file_path(audio_path)

    # Configure AssemblyAI
    configure_assemblyai()

    # Configure transcription with language detection
    config = aai.TranscriptionConfig(
        speech_models=["universal-3-pro", "universal-2"],
        language_detection=True
    )

    # Transcribe
    try:
        transcriber = aai.Transcriber(config=config)
        transcript = transcriber.transcribe(str(audio_file))

        # Check status
        if transcript.status == "error":
            raise RuntimeError(f"Transcription failed: {transcript.error}")

        # Convert to Premiere format
        language_code = f"{language}-{language}" if language else "fr-fr"
        premiere_json = convert_to_premiere_format(transcript, language_code)

        # Extract metadata
        word_count = len(transcript.words) if transcript.words else 0
        duration = transcript.words[-1].end / 1000.0 if transcript.words else 0.0

        return {
            "text": transcript.text,
            "premiere_json": premiere_json,
            "duration": duration,
            "word_count": word_count,
            "language_detected": transcript.language_code if hasattr(transcript, 'language_code') else language
        }

    except Exception as e:
        raise RuntimeError(f"Transcription service error: {str(e)}")
