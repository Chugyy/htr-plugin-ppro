/**
 * Transcription Generation Job
 *
 * Exports the full sequence audio via PPro's exportSequence (IMMEDIATELY mode),
 * uploads once, transcribes once via AssemblyAI. Handles nested sequences,
 * trimmed clips, and effects — timestamps match the timeline directly.
 */

import * as premiereProAPI from '../api/premiereProAPI';
import { backendClient } from '../api/backendAPI';
import { exportSequenceAudio, deleteLocalFile } from '../api/ameAPI';
import type { TranscriptionResponse } from '@/core/types';

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
 * Uses exportSequence to render the timeline audio directly — handles
 * nested sequences, trimmed clips, and effects correctly.
 *
 * Flow:
 * 1. Export full sequence audio via PPro encoder (IMMEDIATELY)
 * 2. Upload 1 file to backend
 * 3. Backend sends 1 file to AssemblyAI → timestamps match timeline
 * 4. Import transcript into Premiere
 */
export async function generateTranscription(
  assignments: TrackSpeakerAssignment[]
): Promise<TranscriptionResponse> {
  console.log(`[JOB] generateTranscription() started with ${assignments.length} track(s)`);

  try {
    // 1. Export full sequence audio (renders timeline as-is, including nested sequences)
    const sequence = await premiereProAPI.getActiveSequence();
    console.log("[JOB] Exporting sequence audio...");
    const localPath = await exportSequenceAudio(sequence);

    // 2. Upload single file
    let serverPath: string;
    try {
      serverPath = await backendClient.uploadAudio(localPath);
    } finally {
      await deleteLocalFile(localPath);
    }
    console.log(`[JOB] Sequence audio uploaded → ${serverPath}`);

    // 3. Transcribe via backend (single call, speaker from first assignment)
    const speaker = assignments.length > 0 ? assignments[0].speaker : undefined;
    const response = await backendClient.generateTranscription(
      [{
        clipName: `sequence_audio`,
        sourceFilePath: serverPath,
        sourceInPoint: 0,
        sourceOutPoint: 0,
        sourceDuration: 0,
        timelineStart: 0,
        timelineEnd: 0,
        timelineDuration: 0,
        trackIndex: 0,
      }],
      true,
      speaker,
    );

    console.log(`[JOB] Transcription done: ${response.wordCount} words, ${response.duration}s`);

    // 4. Import to Premiere Pro
    const sequenceClipItem = await premiereProAPI.getActiveSequenceClipItem();
    console.log("[JOB] Importing transcript to sequence...");
    await premiereProAPI.importTranscript(response.transcriptionJson, sequenceClipItem);
    console.log("[JOB] Transcript imported successfully");

    return response;
  } catch (error) {
    console.error("[JOB] generateTranscription() failed:", error);
    throw error;
  }
}

