# Test Endpoints

## 1. Test Transcription Endpoint

```bash
curl -X POST "http://127.0.0.1:5001/audio/transcription" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "clips": [
      {
        "clip_name": "Interview_Scene_1",
        "source_file_path": "/path/to/video.mp4",
        "source_in_point": 10.5,
        "source_out_point": 45.2,
        "timeline_start": 0.0,
        "timeline_end": 34.7
      },
      {
        "clip_name": "Interview_Scene_2",
        "source_file_path": "/path/to/video2.mp4",
        "source_in_point": 5.0,
        "source_out_point": 25.0,
        "timeline_start": 40.0,
        "timeline_end": 60.0
      }
    ]
  }'
```

**Expected Response:**
```json
{
  "json": {
    "language": "fr-fr",
    "segments": [...],
    "speakers": []
  },
  "text": "Bonjour, voici la transcription complète...",
  "duration": 60.0,
  "word_count": 150
}
```

## 2. Test Correction Endpoint

```bash
curl -X POST "http://127.0.0.1:5001/audio/correction" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "transcription_json": {
      "text": "Bonjourr, comant allez vous aujourdui?",
      "language": "fr-fr",
      "segments": [
        {
          "start": 0.0,
          "duration": 3.5,
          "speaker": "default-speaker",
          "words": [
            {"text": "Bonjourr,", "start": 0.0, "type": "word"},
            {"text": "comant", "start": 0.5, "type": "word"},
            {"text": "allez", "start": 1.0, "type": "word"},
            {"text": "vous", "start": 1.5, "type": "word"},
            {"text": "aujourdui?", "start": 2.0, "type": "word"}
          ]
        }
      ]
    }
  }'
```

**Expected Response:**
```json
{
  "corrected_json": {
    "text": "Bonjour, comment allez-vous aujourd'hui?",
    "language": "fr-fr",
    "segments": [...]
  },
  "corrections_applied": true,
  "model_used": "llm"
}
```

## 3. Test Full Workflow (Transcription → Correction)

### Step 1: Transcribe
```bash
TRANSCRIPTION=$(curl -X POST "http://127.0.0.1:5001/audio/transcription" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "clips": [
      {
        "clip_name": "test_clip",
        "source_file_path": "/path/to/video.mp4",
        "source_in_point": 0.0,
        "source_out_point": 10.0,
        "timeline_start": 0.0,
        "timeline_end": 10.0
      }
    ]
  }')

echo $TRANSCRIPTION | jq .
```

### Step 2: Extract JSON and Correct
```bash
TRANSCRIPTION_JSON=$(echo $TRANSCRIPTION | jq -c '.json')

curl -X POST "http://127.0.0.1:5001/audio/correction" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d "{\"transcription_json\": $TRANSCRIPTION_JSON}" | jq .
```

## Notes

- Replace `your-api-key` with your actual API key from `.env`
- Replace `/path/to/video.mp4` with actual video file paths
- Ensure FFmpeg is installed: `brew install ffmpeg` (Mac) or `apt-get install ffmpeg` (Linux)
- Ensure AssemblyAI API key is configured in `.env`
- Ensure Anthropic or OpenAI API key is configured in `.env` for corrections
