/**
 * Transcription Generation Job
 * Orchestrates: Premiere Pro API → Backend API → Premiere Pro API
 * Supports multi-speaker: 1 track = 1 speaker, parallel transcription.
 */

import * as premiereProAPI from '../api/premiereProAPI';
import { backendClient } from '../api/backendAPI';
import { prepareClipsForBackend } from './utils';
import type { TranscriptionResponse, PremiereTranscriptJSON } from '@/core/types';

export interface TrackSpeakerAssignment {
  trackIndex: number;
  speaker: { id: string; name: string };
}

/**
 * Load active Premiere Pro sequence and extract audio tracks
 * Used by: generationHooks.onLoadSequence()
 */
export async function loadActiveSequence(): Promise<{
  sequenceName: string;
  tracks: Array<{ id: number; name: string; clipCount: number }>;
}> {
  console.log("[JOB] loadActiveSequence() started");

  try {
    // 1. Get active sequence
    const sequence = await premiereProAPI.getActiveSequence();
    const sequenceName = sequence.name;
    console.log(`[JOB] Active sequence: ${sequenceName}`);

    // 2. Get available audio tracks
    const availableTracks = await premiereProAPI.getAvailableAudioTracks();
    console.log(`[JOB] Found ${availableTracks.length} audio tracks`);

    // 3. Analyze each track to get clip count
    const tracksWithClipCount = [];
    for (const track of availableTracks) {
      try {
        const trackInfo = await premiereProAPI.analyzeAudioTrack(track.index);
        tracksWithClipCount.push({
          id: track.index,
          name: track.name,
          clipCount: trackInfo.clipCount
        });
      } catch (error) {
        console.error(`[JOB] Failed to analyze track ${track.index}:`, error);
        tracksWithClipCount.push({
          id: track.index,
          name: track.name,
          clipCount: 0
        });
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
 * Each track is transcribed independently (parallel) then merged into one JSON.
 */
export async function generateTranscription(
  assignments: TrackSpeakerAssignment[]
): Promise<TranscriptionResponse> {
  console.log(`[JOB] generateTranscription() started with ${assignments.length} track(s)`);

  try {
    // 1. Process each track independently in parallel
    const trackResults = await Promise.all(
      assignments.map(async ({ trackIndex, speaker }) => {
        console.log(`[JOB] Processing track ${trackIndex} → speaker "${speaker.name}"`);

        const tracks = await premiereProAPI.analyzeMultipleAudioTracks([trackIndex]);
        const clips = await premiereProAPI.extractAudioClips(tracks);

        if (clips.length === 0) {
          console.warn(`[JOB] Track ${trackIndex} has no clips, skipping`);
          return null;
        }

        const processedClips = await prepareClipsForBackend(clips);
        const response = await backendClient.generateTranscription(processedClips, true, speaker);
        console.log(`[JOB] Track ${trackIndex} done: ${response.wordCount} words, ${response.duration}s`);
        return response;
      })
    );

    // 2. Filter out null results (empty tracks)
    const validResults = trackResults.filter((r): r is TranscriptionResponse => r !== null);

    if (validResults.length === 0) {
      throw new Error("No audio clips found in selected tracks");
    }

    // 3. Merge results into single Premiere JSON
    const merged = mergeTranscriptions(validResults);
    console.log(`[JOB] Merged: ${merged.wordCount} words, ${merged.duration}s, ${merged.transcriptionJson.speakers.length} speaker(s)`);

    // 4. Import to Premiere Pro
    const sequence = await premiereProAPI.getActiveSequence();
    const project = await premiereProAPI.getActiveProject();
    const rootItem = await project.getRootItem();
    const items = await rootItem.getItems();
    let sequenceClipItem = null;

    for (const item of items) {
      if (item.name === sequence.name) {
        const ppro = window.require("premierepro");
        sequenceClipItem = ppro.ClipProjectItem.cast(item);
        break;
      }
    }

    if (sequenceClipItem) {
      console.log("[JOB] Importing transcript to sequence...");
      await premiereProAPI.importTranscript(merged.transcriptionJson, sequenceClipItem);
      console.log("[JOB] Transcript imported successfully");
    } else {
      console.warn("[JOB] Could not find sequence clip item for import");
    }

    console.log("[JOB] generateTranscription() completed");
    return merged;

  } catch (error) {
    console.error("[JOB] generateTranscription() failed:", error);
    throw error;
  }
}

/**
 * Merge multiple single-speaker transcriptions into one multi-speaker JSON.
 * Segments are sorted by start time. Speakers array is deduplicated by ID.
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
