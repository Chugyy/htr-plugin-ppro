/**
 * Silence Removal Job
 * Detects silences from transcript disfluency markers and removes them
 * from the timeline by splitting clips and ripple-shifting.
 *
 * Algorithm: process silences right-to-left so timeline shifts don't
 * invalidate positions of yet-to-be-processed silences.
 */

import {
  getActiveProject,
  getActiveSequence,
  exportTranscript,
  getActiveSequenceClipItem,
} from '../api/premiereProAPI';
import type { PremiereTranscriptJSON } from '@/core/types';

const ppro = window.require("premierepro") as any;

// ── Types ────────────────────────────────────────────────────────────────────

interface Silence {
  start: number;   // timeline position (seconds)
  end: number;
  duration: number;
}

interface ClipInfo {
  item: any;        // AudioClipTrackItem / VideoClipTrackItem
  start: number;    // timeline start
  end: number;      // timeline end
  inPoint: number;  // source in-point
  outPoint: number; // source out-point
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract silence regions from the active sequence's transcript.
 */
export async function detectSilences(): Promise<{ silences: Silence[]; totalDuration: number }> {
  const clipItem = await getActiveSequenceClipItem();
  const transcript = await exportTranscript(clipItem);

  if (!transcript) {
    throw new Error("No transcript found on the active sequence");
  }

  const silences = extractSilencesFromTranscript(transcript);
  const totalDuration = silences.reduce((sum, s) => sum + s.duration, 0);

  return { silences, totalDuration };
}

/**
 * Remove silences from a single track on the active sequence.
 * Uses the transcript's disfluency markers as silence positions.
 * All operations are undoable (Ctrl+Z).
 */
export async function removeSilencesFromTrack(
  trackIndex: number,
  trackType: 'audio' | 'video',
  onProgress?: (step: number, total: number, msg: string) => void,
): Promise<{ removed: number; durationSaved: number }> {
  const { silences } = await detectSilences();

  if (silences.length === 0) {
    return { removed: 0, durationSaved: 0 };
  }

  // Sort right-to-left so shifts don't invalidate earlier positions
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

    // 1. Gather current clip state (async — outside transaction)
    const clips = await getTrackClips(sequence, trackIndex, trackType);

    // Find clip that contains at least the START of this silence (tolerance 0.05s)
    const target = clips.find(c => silence.start >= c.start - 0.05 && silence.start <= c.end + 0.05);

    if (!target) {
      console.warn(`[SILENCE] No clip found for silence at ${silence.start.toFixed(2)}s`);
      continue;
    }

    // Clamp silence end to clip boundary if it extends slightly beyond
    if (silence.end > target.end) {
      silence.end = target.end;
      silence.duration = silence.end - silence.start;
    }

    const isAtStart = Math.abs(silence.start - target.start) < 0.05;
    const isAtEnd = Math.abs(silence.end - target.end) < 0.05;

    // Clips AFTER this clip that need to shift left
    const clipsAfter = clips.filter(c => c.start >= target.end - 0.01 && c !== target);

    if (isAtStart && isAtEnd) {
      // Silence covers entire clip — remove it and shift
      await removeClipAndShift(project, editor, target, clipsAfter, silence.duration);
    } else if (isAtStart) {
      // Silence at beginning — trim left edge, shift everything left
      await trimStartAndShift(project, target, clipsAfter, silence);
    } else if (isAtEnd) {
      // Silence at end — trim right edge, shift clips after
      await trimEndAndShift(project, target, clipsAfter, silence);
    } else {
      // Silence in the middle — clone + trim + reposition
      await splitAndRemove(project, editor, sequence, trackIndex, trackType, target, clipsAfter, silence);
    }

    removed++;
    durationSaved += silence.duration;
  }

  return { removed, durationSaved };
}

// ── Transcript parsing ───────────────────────────────────────────────────────

function extractSilencesFromTranscript(transcript: PremiereTranscriptJSON): Silence[] {
  const silences: Silence[] = [];

  for (const segment of transcript.segments) {
    for (const word of segment.words) {
      if ((word.tags || []).includes('disfluency') && word.text === '') {
        silences.push({
          start: word.start,
          end: word.start + word.duration,
          duration: word.duration,
        });
      }
    }
  }

  return silences.sort((a, b) => a.start - b.start);
}

// ── Track clip helpers ───────────────────────────────────────────────────────

async function getTrackClips(
  sequence: any,
  trackIndex: number,
  trackType: 'audio' | 'video',
): Promise<ClipInfo[]> {
  const track = trackType === 'audio'
    ? await sequence.getAudioTrack(trackIndex)
    : await sequence.getVideoTrack(trackIndex);

  const items = track.getTrackItems(1, false); // 1 = CLIP
  const infos: ClipInfo[] = [];

  for (const item of items) {
    const startTime = await item.getStartTime();
    const endTime = await item.getEndTime();
    const inPoint = await item.getInPoint();
    const outPoint = await item.getOutPoint();

    infos.push({
      item,
      start: startTime.seconds,
      end: endTime.seconds,
      inPoint: inPoint.seconds,
      outPoint: outPoint.seconds,
    });
  }

  return infos.sort((a, b) => a.start - b.start);
}

// ── Edit operations ──────────────────────────────────────────────────────────

/**
 * Remove an entire clip (silence covers it completely) and shift subsequent clips left.
 */
async function removeClipAndShift(
  project: any,
  editor: any,
  target: ClipInfo,
  clipsAfter: ClipInfo[],
  silenceDuration: number,
): Promise<void> {
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      // Remove via selection + ripple would be ideal, but simpler to
      // set duration to 0 by collapsing start/end, then shift.
      // Instead: move clip far away, then shift.
      // Safest: use createSetEndAction to collapse, then shift.
      ca.addAction(target.item.createSetEndAction(
        ppro.TickTime.createWithSeconds(target.start)
      ));
      for (const c of clipsAfter) {
        ca.addAction(c.item.createMoveAction(
          ppro.TickTime.createWithSeconds(-silenceDuration)
        ));
      }
    }, "Supprimer silence");
  });
}

/**
 * Silence at the beginning of a clip: trim the left edge, shift left.
 */
async function trimStartAndShift(
  project: any,
  target: ClipInfo,
  clipsAfter: ClipInfo[],
  silence: Silence,
): Promise<void> {
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      // Trim left edge to silence.end
      ca.addAction(target.item.createSetStartAction(
        ppro.TickTime.createWithSeconds(silence.end)
      ));
      // Move trimmed clip + all after left by silence duration
      ca.addAction(target.item.createMoveAction(
        ppro.TickTime.createWithSeconds(-silence.duration)
      ));
      for (const c of clipsAfter) {
        ca.addAction(c.item.createMoveAction(
          ppro.TickTime.createWithSeconds(-silence.duration)
        ));
      }
    }, "Supprimer silence (d\u00e9but)");
  });
}

/**
 * Silence at the end of a clip: trim the right edge, shift after clips left.
 */
async function trimEndAndShift(
  project: any,
  target: ClipInfo,
  clipsAfter: ClipInfo[],
  silence: Silence,
): Promise<void> {
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      ca.addAction(target.item.createSetEndAction(
        ppro.TickTime.createWithSeconds(silence.start)
      ));
      for (const c of clipsAfter) {
        ca.addAction(c.item.createMoveAction(
          ppro.TickTime.createWithSeconds(-silence.duration)
        ));
      }
    }, "Supprimer silence (fin)");
  });
}

/**
 * Silence in the middle of a clip: clone, trim both halves, reposition.
 *
 * Strategy:
 * 1. Transaction A: Clone clip to a safe position (3600s offset)
 * 2. Async: find the clone by its expected position
 * 3. Transaction B: trim original outPoint, trim clone inPoint, move clone + shift
 */
async function splitAndRemove(
  project: any,
  editor: any,
  sequence: any,
  trackIndex: number,
  trackType: 'audio' | 'video',
  target: ClipInfo,
  clipsAfter: ClipInfo[],
  silence: Silence,
): Promise<void> {
  const SAFE_OFFSET = 3600; // 1h away to avoid overlap

  // Step A: Clone to safe position
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      ca.addAction(editor.createCloneTrackItemAction(
        target.item,
        ppro.TickTime.createWithSeconds(SAFE_OFFSET),
        0, 0, false, false,
      ));
    }, "Clone pour d\u00e9coupage");
  });

  // Step B: Find clone at expected position
  const cloneExpectedStart = target.start + SAFE_OFFSET;
  const clips2 = await getTrackClips(sequence, trackIndex, trackType);
  const clone = clips2.find(c => Math.abs(c.start - cloneExpectedStart) < 0.1);

  if (!clone) {
    console.error("[SILENCE] Clone not found at expected position", cloneExpectedStart);
    return;
  }

  // Compute source-relative trim values
  // Clone needs to show only the part AFTER the silence
  // Source offset of silence.end within the original clip:
  const sourceOffsetSilenceEnd = target.inPoint + (silence.end - target.start);

  // Step C: Trim both + reposition clone + shift subsequent clips
  project.lockedAccess(() => {
    project.executeTransaction((ca: any) => {
      // 1. Original: trim end to silence.start
      ca.addAction(target.item.createSetEndAction(
        ppro.TickTime.createWithSeconds(silence.start)
      ));

      // 2. Clone: set in-point to skip silence portion
      ca.addAction(clone.item.createSetInPointAction(
        ppro.TickTime.createWithSeconds(sourceOffsetSilenceEnd)
      ));

      // 3. Move clone from safe position to right after original (= silence.start)
      // After setInPoint, clone's timeline start shifted right by the trim amount.
      // Clone was at cloneExpectedStart, in-point increased by (sourceOffsetSilenceEnd - clone.inPoint).
      // New clone start = cloneExpectedStart + (sourceOffsetSilenceEnd - clone.inPoint)
      const trimAmount = sourceOffsetSilenceEnd - clone.inPoint;
      const cloneCurrentStart = cloneExpectedStart + trimAmount;
      const moveOffset = silence.start - cloneCurrentStart;
      ca.addAction(clone.item.createMoveAction(
        ppro.TickTime.createWithSeconds(moveOffset)
      ));

      // 4. Shift all clips that were originally after target.end
      for (const c of clipsAfter) {
        ca.addAction(c.item.createMoveAction(
          ppro.TickTime.createWithSeconds(-silence.duration)
        ));
      }
    }, "D\u00e9couper et supprimer silence");
  });
}
