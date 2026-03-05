/**
 * Audio Enhancement Job
 * Orchestrates: Premiere Pro API → Backend API → Premiere Pro API
 */

import * as premiereProAPI from '../api/premiereProAPI';
import { backendClient } from '../api/backendAPI';
import { prepareClipsForBackend } from './utils';
import type { AudioClipInfo, OptimizationResponse } from '@/core/types';

/**
 * Load audio tracks from active sequence
 * Used by: audioHooks.onLoadTracks()
 */
export async function loadAudioTracks(): Promise<Array<{
  id: number;
  name: string;
  duration: string;
  clips: number;
}>> {
  console.log("[JOB] loadAudioTracks() started");

  try {
    // 1. Get available audio tracks
    const availableTracks = await premiereProAPI.getAvailableAudioTracks();
    console.log(`[JOB] Found ${availableTracks.length} audio tracks`);

    // 2. Analyze each track to get metadata
    const tracksWithMetadata = [];
    for (const track of availableTracks) {
      try {
        const trackInfo = await premiereProAPI.analyzeAudioTrack(track.index);

        // Calculate total duration
        let totalDuration = 0;
        for (const clip of trackInfo.clips) {
          totalDuration += clip.sourceDuration;
        }

        // Format duration as HH:MM:SS
        const hours = Math.floor(totalDuration / 3600);
        const minutes = Math.floor((totalDuration % 3600) / 60);
        const seconds = Math.floor(totalDuration % 60);
        const durationStr = hours > 0
          ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
          : `${minutes}:${seconds.toString().padStart(2, '0')}`;

        tracksWithMetadata.push({
          id: track.index,
          name: track.name,
          duration: durationStr,
          clips: trackInfo.clipCount
        });
      } catch (error) {
        console.error(`[JOB] Failed to analyze track ${track.index}:`, error);
        // Add track with default values
        tracksWithMetadata.push({
          id: track.index,
          name: track.name,
          duration: "0:00",
          clips: 0
        });
      }
    }

    console.log("[JOB] loadAudioTracks() completed");
    return tracksWithMetadata;

  } catch (error) {
    console.error("[JOB] loadAudioTracks() failed:", error);
    throw error;
  }
}

/**
 * Optimize audio using selected filter type
 * Used by: audioHooks.onOptimize()
 *
 * Orchestration:
 * 1. Get all audio tracks from sequence
 * 2. Extract clips from all tracks
 * 3. Call backend to optimize audio with selected filter
 * 4. Replace clips in Premiere with optimized audio (NOT IMPLEMENTED YET)
 * 5. Return response
 */
export async function optimizeAudio(
  selectedTracks: Array<{ index: number; filterType: 'voice' | 'music' | 'sound_effects' }>
): Promise<OptimizationResponse> {
  console.log(`[JOB] optimizeAudio() started with ${selectedTracks.length} track(s)`);

  try {
    // 1. Analyze selected tracks
    const trackIndices = selectedTracks.map(t => t.index);
    const tracks = await premiereProAPI.analyzeMultipleAudioTracks(trackIndices);
    console.log(`[JOB] Analyzed ${tracks.length} tracks`);

    // 2. Export via AME + upload per track (flatten → prepare → re-map)
    const allClips: AudioClipInfo[] = tracks.flatMap(t => t.clips);
    const processedClips = await prepareClipsForBackend(allClips);

    let clipIndex = 0;
    const tracksPayload = tracks.map(track => ({
      trackIndex: track.trackIndex,
      filterType: selectedTracks.find(t => t.index === track.trackIndex)?.filterType ?? 'voice',
      clips: track.clips.map(() => processedClips[clipIndex++]),
    }));

    // 3. Call backend to optimize audio (clips are preextracted + uploaded)
    console.log("[JOB] Calling backend for audio optimization...");
    const response = await backendClient.optimizeAudio(tracksPayload);

    if (!response.success || !response.optimizedTracks) {
      throw new Error(response.error || "Audio optimization failed");
    }

    console.log(`[JOB] Audio optimization completed successfully`);
    console.log(`[JOB] - Optimized tracks: ${response.optimizedTracks.length}`);
    console.log(`[JOB] - Processing time: ${response.processingTime}s`);
    console.log(`[JOB] - Output directory: ${response.outputDirectory}`);

    // 4. Import optimized clips into a new audio track in Premiere Pro
    console.log("[JOB] Importing optimized clips into Premiere Pro...");
    await premiereProAPI.importOptimizedClips(response.optimizedTracks!);

    console.log("[JOB] optimizeAudio() completed");
    return response;

  } catch (error) {
    console.error("[JOB] optimizeAudio() failed:", error);
    throw error;
  }
}
