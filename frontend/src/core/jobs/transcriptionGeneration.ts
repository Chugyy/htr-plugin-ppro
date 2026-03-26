/**
 * Transcription Generation Job
 *
 * Fast path: export entire audio track as 1 file → 1 upload → 1 AssemblyAI call.
 * Supports multi-speaker: 1 track = 1 speaker, results merged into one JSON.
 */

import * as premiereProAPI from '../api/premiereProAPI';
import { backendClient } from '../api/backendAPI';
import { exportAudioSegment, deleteLocalFile } from '../api/ameAPI';
import type { TranscriptionResponse, PremiereTranscriptJSON } from '@/core/types';

export interface TrackSpeakerAssignment {
  trackIndex: number;
  speaker: { id: string; name: string };
}

/**
 * Load active Premiere Pro sequence and extract audio tracks
 */
export async function loadActiveSequence(): Promise<{
  sequenceName: string;
  tracks: Array<{ id: number; name: string; clipCount: number }>;
}> {
  console.log("[JOB] loadActiveSequence() started");

  try {
    const sequence = await premiereProAPI.getActiveSequence();
    const sequenceName = sequence.name;

    const availableTracks = await premiereProAPI.getAvailableAudioTracks();
    const tracksWithClipCount = [];

    for (const track of availableTracks) {
      try {
        const trackInfo = await premiereProAPI.analyzeAudioTrack(track.index);
        tracksWithClipCount.push({
          id: track.index,
          name: track.name,
          clipCount: trackInfo.clipCount,
        });
      } catch {
        tracksWithClipCount.push({ id: track.index, name: track.name, clipCount: 0 });
      }
    }

    console.log("[JOB] loadActiveSequence() completed");
    return { sequenceName, tracks: tracksWithClipCount };
  } catch (error) {
    console.error("[JOB] loadActiveSequence() failed:", error);
    throw error;
  }
}

/**
 * Generate transcription for selected tracks with speaker assignments.
 *
 * For each track:
 * 1. Analyze clips → find source file + max out point
 * 2. Export entire track audio as 1 WAV via AME
 * 3. Upload 1 file to backend
 * 4. Backend sends 1 file to AssemblyAI → timestamps match timeline
 * 5. Merge multi-speaker results → import into Premiere
 */
export async function generateTranscription(
  assignments: TrackSpeakerAssignment[]
): Promise<TranscriptionResponse> {
  console.log(`[JOB] generateTranscription() started with ${assignments.length} track(s)`);

  try {
    // Process each track (sequential to avoid AME conflicts)
    const trackResults: (TranscriptionResponse | null)[] = [];

    for (const { trackIndex, speaker } of assignments) {
      console.log(`[JOB] Processing track ${trackIndex} → speaker "${speaker.name}"`);

      // 1. Analyze track to get source file + time range
      const trackInfo = await premiereProAPI.analyzeAudioTrack(trackIndex);

      if (trackInfo.clips.length === 0) {
        console.warn(`[JOB] Track ${trackIndex} has no clips, skipping`);
        trackResults.push(null);
        continue;
      }

      const sourceFile = trackInfo.clips[0].sourceFilePath;
      const maxOut = Math.max(...trackInfo.clips.map(c => c.sourceOutPoint));

      console.log(`[JOB] Track ${trackIndex}: ${trackInfo.clips.length} clips, source range [0-${maxOut.toFixed(1)}s]`);

      // 2. Export entire track audio as 1 file via AME
      console.log(`[JOB] Exporting full audio for track ${trackIndex}...`);
      const localPath = await exportAudioSegment(sourceFile, 0, maxOut, `transcribe_t${trackIndex}`);

      // 3. Upload single file
      let serverPath: string;
      try {
        serverPath = await backendClient.uploadAudio(localPath);
      } finally {
        await deleteLocalFile(localPath);
      }
      console.log(`[JOB] Track ${trackIndex} uploaded → ${serverPath}`);

      // 4. Transcribe via backend (1 clip covering the full track)
      const response = await backendClient.generateTranscription(
        [{
          clipName: `full_track_${trackIndex}`,
          sourceFilePath: serverPath,
          sourceInPoint: 0,
          sourceOutPoint: maxOut,
          timelineStart: 0,
          timelineEnd: maxOut,
          timelineDuration: maxOut,
        }],
        true,
        speaker,
      );

      console.log(`[JOB] Track ${trackIndex} done: ${response.wordCount} words, ${response.duration}s`);
      trackResults.push(response);
    }

    // 5. Filter + merge
    const validResults = trackResults.filter((r): r is TranscriptionResponse => r !== null);

    if (validResults.length === 0) {
      throw new Error("No audio clips found in selected tracks");
    }

    const merged = mergeTranscriptions(validResults);
    console.log(`[JOB] Merged: ${merged.wordCount} words, ${merged.duration}s, ${merged.transcriptionJson.speakers.length} speaker(s)`);

    // 6. Import to Premiere Pro
    const sequenceClipItem = await premiereProAPI.getActiveSequenceClipItem();
    console.log("[JOB] Importing transcript to sequence...");
    await premiereProAPI.importTranscript(merged.transcriptionJson, sequenceClipItem);
    console.log("[JOB] Transcript imported successfully");

    return merged;
  } catch (error) {
    console.error("[JOB] generateTranscription() failed:", error);
    throw error;
  }
}

/**
 * Merge multiple single-speaker transcriptions into one multi-speaker JSON.
 */
function mergeTranscriptions(results: TranscriptionResponse[]): TranscriptionResponse {
  if (results.length === 1) return results[0];

  const allSegments = results.flatMap(r => r.transcriptionJson.segments);
  allSegments.sort((a, b) => a.start - b.start);

  const speakerMap = new Map<string, { id?: string; name?: string }>();
  for (const r of results) {
    for (const s of r.transcriptionJson.speakers) {
      if (s.id && !speakerMap.has(s.id)) {
        speakerMap.set(s.id, s);
      }
    }
  }

  const merged: PremiereTranscriptJSON = {
    language: results[0].transcriptionJson.language,
    segments: allSegments,
    speakers: Array.from(speakerMap.values()),
  };

  return {
    transcriptionJson: merged,
    text: results.map(r => r.text).join(' '),
    duration: Math.max(...results.map(r => r.duration)),
    wordCount: results.reduce((sum, r) => sum + r.wordCount, 0),
  };
}
