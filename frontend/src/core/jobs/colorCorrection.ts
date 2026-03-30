/**
 * Color Correction Job — Orchestration
 *
 * 1. Scan selected video tracks → list clips
 * 2. Group clips by source media (unique file path)
 * 3. For each unique media: export 1 frame → upload → analyze → get corrections
 * 4. For each clip: apply Lumetri with its media's corrections
 *
 * Supports LOG footage detection (auto or manual profile selection).
 * Full reset: removes ALL Lumetri effects added by the plugin, allowing
 * the user to retry with a different profile without accumulating effects.
 */

import type { VideoTrackInfo, LumetriCorrections, LogDetection } from '@/core/types';
import type { LogProfile } from '@/core/types';
import {
  getVideoTracks,
  exportFrame,
  applyLumetriToClip,
  removeLumetriFromClip,
  clipHasLumetri,
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
 * Scan all tracks for clips that already have a Lumetri effect.
 * Used on sequence load to restore the "Reset" button state.
 */
export async function detectExistingLumetri(tracks: VideoTrackInfo[]): Promise<CorrectedClip[]> {
  const found: CorrectedClip[] = [];
  for (const track of tracks) {
    for (let c = 0; c < track.clips.length; c++) {
      try {
        if (await clipHasLumetri(track.trackIndex, c)) {
          found.push({ trackIndex: track.trackIndex, clipIndex: c });
        }
      } catch { /* skip inaccessible clips */ }
    }
  }
  return found;
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
  logProfile: LogProfile,
  onProgress: ProgressCallback,
): Promise<{ mediaCount: number; clipCount: number; correctedClips: CorrectedClip[]; logDetections: Map<string, LogDetection> }> {
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
  const logDetections = new Map<string, LogDetection>();

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

    const firstClip = clips[0];
    const midTime = firstClip.timelineStart + firstClip.timelineDuration / 2;
    const frameFilename = `frame_${mediaIdx}.png`;

    const frameBuffer = await exportFrame(midTime, frameFilename);

    onProgress({
      stage: 'analyzing',
      message: `Analyse: ${mediaName}`,
      current: mediaIdx,
      total: mediaCount,
    });

    const response = await backendClient.analyzeFrame(frameBuffer, frameFilename, logProfile);
    corrections.set(mediaPath, response.corrections);
    logDetections.set(mediaPath, response.logDetection);

    const ld = response.logDetection;
    const logLabel = ld.isLog
      ? `LOG détecté (${ld.estimatedProfile}, ${Math.round(ld.confidence * 100)}%)`
      : 'Standard';
    console.log(`[COLOR] ${mediaName}: ${logLabel}, expo=${response.corrections.exposure}, contrast=${response.corrections.contrast}`);
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

      const hasCorrection = Object.entries(clipCorrections).some(([key, val]) => {
        if (key === 'saturation') return val !== 100;
        return val !== 0;
      });
      if (!hasCorrection) {
        console.log(`[COLOR] Skip ${clip.clipName} (neutral)`);
        continue;
      }

      // Build status message with LOG info
      const ld = logDetections.get(clip.sourceFilePath);
      const logTag = ld?.isLog ? ` [${ld.estimatedProfile}]` : '';

      onProgress({
        stage: 'applying',
        message: `Lumetri${logTag}: ${clip.clipName}`,
        current: clipIdx,
        total: totalClips,
      });

      const trackData = allTracks.find(t => t.trackIndex === clip.trackIndex)!;
      const realClipIdx = trackData.clips.indexOf(clip);

      await applyLumetriToClip(clip.trackIndex, realClipIdx, clipCorrections);
      correctedClips.push({ trackIndex: clip.trackIndex, clipIndex: realClipIdx });
    }
  }

  // Build summary with LOG detection info
  const logCount = [...logDetections.values()].filter(d => d.isLog).length;
  const logSummary = logCount > 0 ? ` (${logCount} LOG)` : '';
  onProgress({ stage: 'done', message: `Terminé — ${mediaCount} média(s)${logSummary}, ${correctedClips.length} clip(s) corrigé(s)` });

  return { mediaCount, clipCount: correctedClips.length, correctedClips, logDetections };
}

/**
 * Remove ALL Lumetri corrections added by the plugin from previously corrected clips.
 * Removes every Lumetri effect on each clip (not just the last one),
 * so the user can safely retry with a different LOG profile.
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
    // Remove all Lumetri effects (loop until none left)
    let hadLumetri = true;
    while (hadLumetri) {
      hadLumetri = await removeLumetriFromClip(trackIndex, clipIndex);
      if (hadLumetri) removed++;
    }
  }

  onProgress({ stage: 'done', message: `Réinitialisé — ${removed} effet(s) supprimé(s)` });
}
