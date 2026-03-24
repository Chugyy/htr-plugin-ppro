/**
 * Shared job utilities
 * Reusable across transcription, audio enhancement, and future jobs.
 */

import { backendClient } from '../api/backendAPI';
import * as ameAPI from '../api/ameAPI';
import type { AudioClipInfo } from '@/core/types';

/**
 * Export each clip via AME, upload to backend, delete local file.
 * Returns clips with sourceFilePath replaced by the server path (preextracted=true).
 *
 * Used by: transcriptionGeneration, audioEnhancement (and any future job).
 */
export async function prepareClipsForBackend(clips: AudioClipInfo[]): Promise<AudioClipInfo[]> {
  console.log(`[UTILS] prepareClipsForBackend: ${clips.length} clip(s)`);

  // Sequential processing to avoid AME queue overflow (post-derust can have 70+ clips)
  const results: AudioClipInfo[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    console.log(`[UTILS] AME export ${i + 1}/${clips.length}: ${clip.clipName} (${clip.sourceInPoint.toFixed(2)}s → ${clip.sourceOutPoint.toFixed(2)}s)`);

    const localAudioPath = await ameAPI.exportAudioSegment(
      clip.sourceFilePath,
      clip.sourceInPoint,
      clip.sourceOutPoint,
      clip.clipName,
    );

    let serverPath: string;
    try {
      serverPath = await backendClient.uploadAudio(localAudioPath);
    } finally {
      await ameAPI.deleteLocalFile(localAudioPath);
    }

    console.log(`[UTILS] Uploaded ${i + 1}/${clips.length}: ${clip.clipName} → ${serverPath}`);
    results.push({
      ...clip,
      sourceFilePath: serverPath,
      sourceInPoint: 0,
      sourceOutPoint: clip.sourceDuration,
    });
  }

  return results;
}
