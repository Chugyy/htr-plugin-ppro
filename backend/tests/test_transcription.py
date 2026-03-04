#!/usr/bin/env python3
# tests/test_transcription.py

"""
Simple test script for transcription service

Usage:
    python tests/test_transcription.py <audio_file_path>

Example:
    python tests/test_transcription.py tmp/test_audio.wav
"""

import sys
import asyncio
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.services.transcription import transcribe_audio


async def test_transcription(audio_path: str):
    """Test transcription service with given audio file"""
    print(f"\n=== Testing Transcription Service ===")
    print(f"Audio file: {audio_path}\n")

    try:
        # Run transcription
        result = await transcribe_audio(audio_path, language="fr")

        # Display results
        print(f"✓ Transcription successful!")
        print(f"\n--- Full Text ---")
        print(result["text"])
        print(f"\n--- Metadata ---")
        print(f"Duration: {result['duration']:.2f}s")
        print(f"Word count: {result['word_count']}")
        print(f"Language detected: {result['language_detected']}")
        print(f"\n--- Premiere Pro JSON ---")
        print(f"Segments count: {len(result['premiere_json']['segments'])}")
        print(f"\nFirst segment preview:")
        if result['premiere_json']['segments']:
            first_segment = result['premiere_json']['segments'][0]
            print(json.dumps(first_segment, indent=2, ensure_ascii=False))

        print(f"\n✓ Test completed successfully!")

    except FileNotFoundError as e:
        print(f"✗ Error: Audio file not found - {e}")
        sys.exit(1)

    except RuntimeError as e:
        print(f"✗ Error: Transcription failed - {e}")
        sys.exit(1)

    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python tests/test_transcription.py <audio_file_path>")
        print("\nExample:")
        print("  python tests/test_transcription.py tmp/test_audio.wav")
        sys.exit(1)

    audio_file = sys.argv[1]
    asyncio.run(test_transcription(audio_file))
