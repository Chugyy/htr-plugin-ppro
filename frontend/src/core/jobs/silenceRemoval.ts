/**
 * Silence Removal Job
 * Detects real audio silences via ffmpeg (backend) and removes them
 * from the timeline by splitting clips and ripple-shifting.
 *
 * Flow: AME export → upload → backend silencedetect → cut timeline
 */

import {
  getActiveProject,
  getActiveSequence,
  analyzeAudioTrack,
} from '../api/premiereProAPI';
import { backendClient } from '../api/backendAPI';
import { exportAudioSegment, deleteLocalFile } from '../api/ameAPI';

const ppro = window.require("premierepro") as any;

// ── Types ────────────────────────────────────────────────────────────────────

export interface Silence {
  start: number;
  end: number;
  duration: number;
}

interface ClipInfo {
  item: any;
  start: number;
  end: number;
  inPoint: number;
  outPoint: number;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect real silences from audio on the given track.
 * Extracts audio via AME, uploads to backend, runs ffmpeg silencedetect.
 */
export async function detectSilences(
  trackIndex: number,
  onProgress?: (msg: string) => void,
): Promise<{ silences: Silence[]; totalDuration: number; audioDuration: number }> {
  onProgress?.("Analyse de la piste audio...");
  const trackInfo = await analyzeAudioTrack(trackIndex);

  if (trackInfo.clips.length === 0) {
    throw new Error("Aucun clip sur cette piste");
  }

  // For each clip: export audio, upload, detect silences
  const allSilences: Silence[] = [];
  let totalAudioDuration = 0;

  for (let i = 0; i < trackInfo.clips.length; i++) {
    const clip = trackInfo.clips[i];
    onProgress?.(`Export audio ${i + 1}/${trackInfo.clips.length}...`);

    // Export via AME
    const localPath = await exportAudioSegment(
      clip.sourceFilePath,
      clip.sourceInPoint,
      clip.sourceOutPoint,
      clip.clipName,
    );

    // Upload to backend
    onProgress?.(`Upload ${i + 1}/${trackInfo.clips.length}...`);
    const serverPath = await backendClient.uploadAudio(localPath);
    await deleteLocalFile(localPath);

    // Detect silences with timeline offset
    onProgress?.(`Détection des silences ${i + 1}/${trackInfo.clips.length}...`);
    const result = await backendClient.detectSilences(serverPath, {
      timelineOffset: clip.timelineStart,
    });

    allSilences.push(...result.silences);
    totalAudioDuration += result.audioDuration;
  }

  // Sort by start time
  allSilences.sort((a, b) => a.start - b.start);
  const totalDuration = allSilences.reduce((sum, s) => sum + s.duration, 0);

  console.log(`[SILENCE] Detected ${allSilences.length} real silence(s), ${totalDuration.toFixed(1)}s total`);

  return { silences: allSilences, totalDuration, audioDuration: totalAudioDuration };
}

/**
 * Remove silences from a single track on the active sequence.
 * All operations are undoable (Ctrl+Z).
 */
export async function removeSilencesFromTrack(
  trackIndex: number,
  trackType: 'audio' | 'video',
  silences: Silence[],
  onProgress?: (step: number, total: number, msg: string) => void,
): Promise<{ removed: number; durationSaved: number }> {
  if (silences.length === 0) {
    return { removed: 0, durationSaved: 0 };
  }

  // Sort right-to-left
  const sorted = [...silences].sort((a, b) => b.start - a.start);
  const total = sorted.length;
  let removed = 0;
  let durationSaved = 0;

  const sequence = await getActiveSequence();
  const project = await getActiveProject();
  const editor = ppro.SequenceEditor.getEditor(sequence);

  for (let i = 0; i < sorted.length; i++) {
    const silence = sorted[i];
    onProgress?.(i + 1, total, `Silence ${i + 1}/${total} (${silence.duration.toFixed(2)}s)`);

    const clips = await getTrackClips(sequence, trackIndex, trackType);
    const target = clips.find(c => silence.start >= c.start - 0.05 && silence.start <= c.end + 0.05);

    if (!target) {
      console.warn(`[SILENCE] No clip for silence at ${silence.start.toFixed(2)}s — skipping`);
      continue;
    }

    // Clamp silence to clip boundary
    if (silence.end > target.end) {
      silence.end = target.end;
      silence.duration = silence.end - silence.start;
    }
    if (silence.duration < 0.05) continue;

    const isAtStart = Math.abs(silence.start - target.start) < 0.05;
    const isAtEnd = Math.abs(silence.end - target.end) < 0.05;
    const clipsAfter = clips.filter(c => c.start >= target.end - 0.01 && c !== target);

    try {
      if (isAtStart && isAtEnd) {
        await trimEndAndShift(project, target, clipsAfter, silence);
      } else if (isAtStart) {
        await trimStartAndShift(project, target, clipsAfter, silence);
      } else if (isAtEnd) {
        await trimEndAndShift(project, target, clipsAfter, silence);
      } else {
        await splitAndRemove(project, editor, sequence, trackIndex, trackType, target, clipsAfter, silence);
      }
      removed++;
      durationSaved += silence.duration;
    } catch (err) {
      console.error(`[SILENCE] Failed at ${silence.start.toFixed(3)}s:`, err);
    }
  }

  return { removed, durationSaved };
}

// ── Track clip helpers ───────────────────────────────────────────────────────

async function getTrackClips(sequence: any, trackIndex: number, trackType: 'audio' | 'video'): Promise<ClipInfo[]> {
  const track = trackType === 'audio'
    ? await sequence.getAudioTrack(trackIndex)
    : await sequence.getVideoTrack(trackIndex);

  const items = track.getTrackItems(1, false);
  const infos: ClipInfo[] = [];

  for (const item of items) {
    infos.push({
      item,
      start: (await item.getStartTime()).seconds,
      end: (await item.getEndTime()).seconds,
      inPoint: (await item.getInPoint()).seconds,
      outPoint: (await item.getOutPoint()).seconds,
    });
  }

  return infos.sort((a, b) => a.start - b.start);
}

// ── Edit operations ──────────────────────────────────────────────────────────

async function trimStartAndShift(project: any, target: ClipInfo, clipsAfter: ClipInfo[], silence: Silence): Promise<void> {
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      ca.addAction(target.item.createSetStartAction(ppro.TickTime.createWithSeconds(silence.end)));
      ca.addAction(target.item.createMoveAction(ppro.TickTime.createWithSeconds(-silence.duration)));
      for (const c of clipsAfter) {
        ca.addAction(c.item.createMoveAction(ppro.TickTime.createWithSeconds(-silence.duration)));
      }
    }, "Supprimer silence");
  });
}

async function trimEndAndShift(project: any, target: ClipInfo, clipsAfter: ClipInfo[], silence: Silence): Promise<void> {
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      ca.addAction(target.item.createSetEndAction(ppro.TickTime.createWithSeconds(silence.start)));
      for (const c of clipsAfter) {
        ca.addAction(c.item.createMoveAction(ppro.TickTime.createWithSeconds(-silence.duration)));
      }
    }, "Supprimer silence");
  });
}

async function splitAndRemove(
  project: any, editor: any, sequence: any,
  trackIndex: number, trackType: 'audio' | 'video',
  target: ClipInfo, clipsAfter: ClipInfo[], silence: Silence,
): Promise<void> {
  const SAFE_OFFSET = 3600;

  // Step A: Clone
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      ca.addAction(editor.createCloneTrackItemAction(
        target.item, ppro.TickTime.createWithSeconds(SAFE_OFFSET), 0, 0, false, false,
      ));
    }, "Clone");
  });

  // Step B: Find clone + re-query original
  const clips2 = await getTrackClips(sequence, trackIndex, trackType);
  const cloneExpectedStart = target.start + SAFE_OFFSET;
  const clone = clips2.find(c => Math.abs(c.start - cloneExpectedStart) < 0.5);
  const original = clips2.find(c => Math.abs(c.start - target.start) < 0.05 && Math.abs(c.end - target.end) < 0.05);

  if (!clone || !original) {
    console.error("[SILENCE] Clone or original not found after cloning");
    return;
  }

  const sourceOffsetSilenceEnd = original.inPoint + (silence.end - original.start);

  // Step C: Trim original end
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      ca.addAction(original.item.createSetEndAction(ppro.TickTime.createWithSeconds(silence.start)));
    }, "Trim original");
  });

  // Step D: Set clone in-point
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      ca.addAction(clone.item.createSetInPointAction(ppro.TickTime.createWithSeconds(sourceOffsetSilenceEnd)));
    }, "Trim clone");
  });

  // Step E: Move clone back
  const clips3 = await getTrackClips(sequence, trackIndex, trackType);
  const cloneAfterTrim = clips3.find(c => c.start > SAFE_OFFSET - 100);
  if (!cloneAfterTrim) return;

  const moveOffset = silence.start - cloneAfterTrim.start;
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      ca.addAction(cloneAfterTrim.item.createMoveAction(ppro.TickTime.createWithSeconds(moveOffset)));
    }, "Move clone");
  });

  // Step F: Shift clips after
  const clips4 = await getTrackClips(sequence, trackIndex, trackType);
  const toShift = clips4.filter(c => c.start > silence.start + 0.05 && c.start < SAFE_OFFSET - 100);
  if (toShift.length > 0) {
    project.lockedAccess(() => {
      project.executeTransaction((ca: any) => {
        for (const c of toShift) {
          ca.addAction(c.item.createMoveAction(ppro.TickTime.createWithSeconds(-silence.duration)));
        }
      }, "Shift clips");
    });
  }
}
