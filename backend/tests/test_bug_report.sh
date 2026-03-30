#!/bin/bash
# Test script for the bug report system.
# Usage: ./tests/test_bug_report.sh <API_KEY> [BASE_URL]
#
# Prerequisites: backend running, migration 005 applied.

set -e

API_KEY="${1:?Usage: $0 <API_KEY> [BASE_URL]}"
BASE_URL="${2:-http://127.0.0.1:5001}"
REQUEST_ID="test-$(date +%s)-$(openssl rand -hex 4)"

echo "=== 1. Test POST /bug-reports ==="
echo "Request ID: $REQUEST_ID"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/bug-reports" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY}" \
  -H "X-Request-Id: ${REQUEST_ID}" \
  -d '{
    "feature": "generation",
    "errorMessage": "Test error — AssemblyAI timeout after 30s",
    "errorStack": "Error: Test error\n    at generateTranscription (transcriptionGeneration.ts:105)\n    at HTMLElement.click (generationHooks.ts:275)",
    "frontendLogs": "[2026-03-30T14:32:01.000Z] [LOG] [JOB] generateTranscription() started with 1 track(s)\n[2026-03-30T14:32:01.500Z] [LOG] [BackendClient] POST /audio/upload [rid:abc-123]\n[2026-03-30T14:32:05.000Z] [LOG] [BackendClient] POST /audio/transcription [rid:def-456]\n[2026-03-30T14:32:35.000Z] [ERROR] [JOB] generateTranscription() failed: AssemblyAI timeout after 30s",
    "projectState": {
      "sequenceName": "Interview_Final_v3",
      "audioTracks": [
        {"name": "Audio 1", "clipCount": 3},
        {"name": "Audio 2", "clipCount": 1}
      ],
      "videoTracks": [
        {"name": "Video 1", "clipCount": 5}
      ],
      "clips": [
        {"name": "Interview_001.mp4", "mediaPath": "/Volumes/SSD/Projets/Interview_001.mp4", "duration": 125.5},
        {"name": "Interview_002.mp4", "mediaPath": "/Volumes/SSD/Projets/Interview_002.mp4", "duration": 98.2}
      ]
    },
    "systemInfo": {
      "pluginVersion": "1.0.0",
      "hostApp": "premierepro",
      "hostVersion": "26.1.0",
      "uxpVersion": "7.4.0",
      "os": "darwin",
      "timestamp": "2026-03-30T14:32:35.000Z"
    },
    "requestIds": ["abc-123", "def-456"]
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "HTTP ${HTTP_CODE}"
echo "Response: ${BODY}"
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL — expected 200, got ${HTTP_CODE}"
  exit 1
fi

REPORT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "?")
echo "Report ID: #${REPORT_ID}"
echo ""

echo "=== 2. Verify X-Request-Id in logs ==="
echo "Searching for '${REQUEST_ID}' in logs/app.log..."
echo ""

if [ -f "logs/app.log" ]; then
  MATCHES=$(grep -c "${REQUEST_ID}" logs/app.log 2>/dev/null || echo "0")
  echo "Found ${MATCHES} log line(s) with this request ID."
  grep "${REQUEST_ID}" logs/app.log 2>/dev/null | head -5
else
  echo "logs/app.log not found (run from backend/ directory)"
fi

echo ""
echo "=== 3. Verify in database ==="
echo "Run this SQL to check:"
echo ""
echo "  SELECT id, feature, error_message, system_info->>'hostVersion' as ppro_version,"
echo "         array_length(request_ids, 1) as rid_count, created_at"
echo "  FROM bug_reports ORDER BY created_at DESC LIMIT 5;"
echo ""
echo "=== Done ==="
