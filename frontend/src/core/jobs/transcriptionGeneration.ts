/**
 * Transcription Generation Job
 * Orchestrates: Premiere Pro API → Backend API → Premiere Pro API
 */

import * as premiereProAPI from '../api/premiereProAPI';
import { backendClient } from '../api/backendAPI';
import type { TranscriptionResponse } from '@/core/types';

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
        // Add track with 0 clips
        tracksWithClipCount.push({
          id: track.index,
          name: track.name,
          clipCount: 0
        });
      }
    }

    console.log("[JOB] loadActiveSequence() completed");
    return {
      sequenceName,
      tracks: tracksWithClipCount
    };

  } catch (error) {
    console.error("[JOB] loadActiveSequence() failed:", error);
    throw error;
  }
}

/**
 * Generate transcription for selected tracks
 * Used by: generationHooks.onGenerate()
 *
 * Orchestration:
 * 1. Get tracks from selected indices
 * 2. Extract audio clips from tracks
 * 3. Call backend to generate transcription
 * 4. Import transcript back to Premiere Pro
 * 5. Return response
 */
export async function generateTranscription(
  selectedTrackIndices: number[]
): Promise<TranscriptionResponse> {
  console.log(`[JOB] generateTranscription() started with tracks: ${selectedTrackIndices}`);

  try {
    // 1. Analyze selected tracks
    const tracks = await premiereProAPI.analyzeMultipleAudioTracks(selectedTrackIndices);
    console.log(`[JOB] Analyzed ${tracks.length} tracks`);

    // 2. Extract all clips from tracks
    const clips = await premiereProAPI.extractAudioClips(tracks);
    console.log(`[JOB] Extracted ${clips.length} clips`);

    if (clips.length === 0) {
      throw new Error("No audio clips found in selected tracks");
    }

    // 3. Call backend to generate transcription
    console.log("[JOB] Calling backend for transcription...");
    const response = await backendClient.generateTranscription(clips);

    if (!response.transcriptionJson) {
      throw new Error("Transcription generation failed");
    }

    console.log(`[JOB] Transcription generated successfully`);
    console.log(`[JOB] - Word count: ${response.wordCount}`);
    console.log(`[JOB] - Duration: ${response.duration}s`);

    // 4. Import transcript to Premiere Pro
    // Get active sequence as clip project item
    const sequence = await premiereProAPI.getActiveSequence();
    const project = await premiereProAPI.getActiveProject();
    const rootItem = await project.getRootItem();

    // Find sequence in project items
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
      await premiereProAPI.importTranscript(response.transcriptionJson, sequenceClipItem);
      console.log("[JOB] Transcript imported successfully");
    } else {
      console.warn("[JOB] Could not find sequence clip item for import");
    }

    console.log("[JOB] generateTranscription() completed");
    return response;

  } catch (error) {
    console.error("[JOB] generateTranscription() failed:", error);
    throw error;
  }
}
