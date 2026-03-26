/**
 * Color Correction Job — Orchestration
 *
 * 1. Scan selected video tracks → list clips
 * 2. Group clips by source media (unique file path)
 * 3. For each unique media: export 1 frame → upload → analyze → get corrections
 * 4. For each clip: apply Lumetri with its media's corrections
 */

import type { VideoTrackInfo, LumetriCorrections } from '@/core/types';
import {
  getVideoTracks,
  exportFrame,
  applyLumetriToClip,
  removeLumetriFromClip,
} from '@/core/api/premiereProAPI';
import { backendClient } from '@/core/api/backendAPI';

export interface ColorCorrectionProgress {
  stage: 'scanning' | 'exporting' | 'analyzing' | 'applying' | 'done' | 'error';
  message: string;
  current?: number;
  total?: number;
}

type ProgressCallback = (progress: ColorCorrectionProgress) => void;

/**
 * Load video tracks from the active sequence.
 */
export async function loadVideoTracks(): Promise<VideoTrackInfo[]> {
  return getVideoTracks();
}

/**
 * Run color correction on selected tracks.
 */
export interface CorrectedClip {
  trackIndex: number;
  clipIndex: number;
}

export async function runColorCorrection(
  selectedTrackIndices: number[],
  allTracks: VideoTrackInfo[],
  onProgress: ProgressCallback,
): Promise<{ mediaCount: number; clipCount: number; correctedClips: CorrectedClip[] }> {
  // 1. Gather clips from selected tracks
  onProgress({ stage: 'scanning', message: 'Analyse des pistes sélectionnées...' });

  const selectedTracks = allTracks.filter(t => selectedTrackIndices.includes(t.trackIndex));
  const allClips = selectedTracks.flatMap(t => t.clips);

  if (allClips.length === 0) throw new Error('Aucun clip vidéo trouvé sur les pistes sélectionnées');

  // 2. Group by source media path
  const mediaGroups = new Map<string, typeof allClips>();
  for (const clip of allClips) {
    const key = clip.sourceFilePath;
    if (!mediaGroups.has(key)) mediaGroups.set(key, []);
    mediaGroups.get(key)!.push(clip);
  }

  const mediaCount = mediaGroups.size;
  onProgress({ stage: 'scanning', message: `${mediaCount} média(s) unique(s), ${allClips.length} clip(s)` });

  // 3. For each unique media: export frame → analyze → store corrections
  const corrections = new Map<string, LumetriCorrections>();

  let mediaIdx = 0;
  for (const [mediaPath, clips] of mediaGroups) {
    mediaIdx++;
    const mediaName = mediaPath.split('/').pop() || 'unknown';
    onProgress({
      stage: 'exporting',
      message: `Export frame: ${mediaName}`,
      current: mediaIdx,
      total: mediaCount,
    });

    // Export a frame from the middle of the first clip of this media
    const firstClip = clips[0];
    const midTime = firstClip.timelineStart + firstClip.timelineDuration / 2;
    const frameFilename = `frame_${mediaIdx}.png`;

    const frameBuffer = await exportFrame(midTime, frameFilename);

    // Upload + analyze
    onProgress({
      stage: 'analyzing',
      message: `Analyse: ${mediaName}`,
      current: mediaIdx,
      total: mediaCount,
    });

    const response = await backendClient.analyzeFrame(frameBuffer, frameFilename);
    corrections.set(mediaPath, response.corrections);

    console.log(`[COLOR] ${mediaName}: temp=${response.corrections.temperature}, expo=${response.corrections.exposure}`);
  }

  // 4. Apply corrections to each clip
  let clipIdx = 0;
  const totalClips = allClips.length;
  const correctedClips: CorrectedClip[] = [];

  for (const track of selectedTracks) {
    for (let c = 0; c < track.clips.length; c++) {
      const clip = track.clips[c];
      clipIdx++;

      const clipCorrections = corrections.get(clip.sourceFilePath);
      if (!clipCorrections) continue;

      // Skip if all corrections are neutral
      const hasCorrection = Object.entries(clipCorrections).some(([key, val]) => {
        if (key === 'saturation') return val !== 100;
        return val !== 0;
      });
      if (!hasCorrection) {
        console.log(`[COLOR] Skip ${clip.clipName} (neutral)`);
        continue;
      }

      onProgress({
        stage: 'applying',
        message: `Lumetri: ${clip.clipName}`,
        current: clipIdx,
        total: totalClips,
      });

      // Find the real clip index within its track
      const trackData = allTracks.find(t => t.trackIndex === clip.trackIndex)!;
      const realClipIdx = trackData.clips.indexOf(clip);

      await applyLumetriToClip(clip.trackIndex, realClipIdx, clipCorrections);
      correctedClips.push({ trackIndex: clip.trackIndex, clipIndex: realClipIdx });
    }
  }

  onProgress({ stage: 'done', message: `Terminé — ${mediaCount} média(s), ${correctedClips.length} clip(s) corrigé(s)` });

  return { mediaCount, clipCount: correctedClips.length, correctedClips };
}

/**
 * Remove Lumetri corrections from previously corrected clips.
 */
export async function resetColorCorrection(
  correctedClips: CorrectedClip[],
  onProgress: ProgressCallback,
): Promise<void> {
  onProgress({ stage: 'applying', message: 'Suppression des corrections...' });

  let removed = 0;
  for (let i = 0; i < correctedClips.length; i++) {
    const { trackIndex, clipIndex } = correctedClips[i];
    onProgress({
      stage: 'applying',
      message: `Suppression Lumetri...`,
      current: i + 1,
      total: correctedClips.length,
    });
    const ok = await removeLumetriFromClip(trackIndex, clipIndex);
    if (ok) removed++;
  }

  onProgress({ stage: 'done', message: `Réinitialisé — ${removed} clip(s)` });
}
