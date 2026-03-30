/**
 * Silence Removal Job
 *
 * Flow:
 * 1. AME export audio → upload to backend
 * 2. Backend ffmpeg silencedetect → silence timestamps
 * 3. Compute speech segments (inverse of silences)
 * 4. Trim original to first segment, insert remaining via overwrite
 *
 * Uses createOverwriteItemAction (proven reliable) instead of
 * createCloneTrackItemAction (causes mute audio on cloned clips).
 */

import {
  getActiveProject,
  getActiveSequence,
  analyzeAudioTrack,
  safeTransaction,
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

interface SpeechSegment {
  srcIn: number;   // source in-point (seconds)
  srcOut: number;  // source out-point (seconds)
  position: number; // timeline position (seconds)
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect real silences from audio on the given track.
 */
export interface DerushOptions {
  noiseThreshold?: number;  // dB, default -30
  minDuration?: number;     // seconds, default 0.5
  padding?: number;         // seconds, default 0.2
}

export async function detectSilences(
  trackIndex: number,
  onProgress?: (msg: string) => void,
  options?: DerushOptions,
): Promise<{ silences: Silence[]; totalDuration: number; audioDuration: number }> {
  onProgress?.("Analyse de la piste audio...");
  const trackInfo = await analyzeAudioTrack(trackIndex);

  if (trackInfo.clips.length === 0) {
    throw new Error("Aucun clip sur cette piste");
  }

  const allSilences: Silence[] = [];
  let totalAudioDuration = 0;

  for (let i = 0; i < trackInfo.clips.length; i++) {
    const clip = trackInfo.clips[i];
    onProgress?.(`Export audio ${i + 1}/${trackInfo.clips.length}...`);

    const localPath = await exportAudioSegment(
      clip.sourceFilePath, clip.sourceInPoint, clip.sourceOutPoint, clip.clipName,
    );

    onProgress?.(`Upload ${i + 1}/${trackInfo.clips.length}...`);
    const serverPath = await backendClient.uploadAudio(localPath);
    await deleteLocalFile(localPath);

    onProgress?.(`Détection des silences ${i + 1}/${trackInfo.clips.length}...`);
    const result = await backendClient.detectSilences(serverPath, {
      noiseThreshold: options?.noiseThreshold,
      minDuration: options?.minDuration,
      timelineOffset: clip.timelineStart,
    });

    allSilences.push(...result.silences);
    totalAudioDuration += result.audioDuration;
  }

  allSilences.sort((a, b) => a.start - b.start);

  // Merge silences separated by less than 0.3s
  const merged = mergeSilences(allSilences, 0.3);
  const totalDuration = merged.reduce((sum, s) => sum + s.duration, 0);

  console.log(`[SILENCE] ${allSilences.length} raw → ${merged.length} merged, ${totalDuration.toFixed(1)}s total`);
  return { silences: merged, totalDuration, audioDuration: totalAudioDuration };
}

/**
 * Remove silences from a single audio track.
 *
 * Strategy: compute speech segments (non-silent parts), remove original clip,
 * re-insert the source media once per speech segment with correct in/out points.
 */
export async function removeSilencesFromTrack(
  trackIndex: number,
  silences: Silence[],
  onProgress?: (step: number, total: number, msg: string) => void,
  options?: DerushOptions,
): Promise<{ removed: number; durationSaved: number }> {
  if (silences.length === 0) {
    return { removed: 0, durationSaved: 0 };
  }

  const sequence = await getActiveSequence();
  const project = await getActiveProject();
  const editor = ppro.SequenceEditor.getEditor(sequence);

  // 1. Get clip info from timeline + ProjectItem from project tree (survives removal)
  const track = await sequence.getAudioTrack(trackIndex);
  const items = track.getTrackItems(1, false);
  if (items.length === 0) throw new Error("Aucun clip sur la piste");

  const clip = items[0];
  const clipStart = (await clip.getStartTime()).seconds;
  const clipEnd = (await clip.getEndTime()).seconds;
  const srcIn = (await clip.getInPoint()).seconds;
  const srcOut = (await clip.getOutPoint()).seconds;
  const clipName = await clip.getName();

  const rootItem = await project.getRootItem();
  const treeItem = await findProjectItemByName(rootItem, clipName);
  if (!treeItem) throw new Error(`"${clipName}" introuvable dans le projet`);
  const clipPI = ppro.ClipProjectItem.cast(treeItem);
  const projectItem = treeItem;

  console.log(`[DERUST] Clip: timeline=[${clipStart.toFixed(3)}-${clipEnd.toFixed(3)}] src=[${srcIn.toFixed(3)}-${srcOut.toFixed(3)}]`);

  // 2. Compute speech segments
  const padding = options?.padding ?? 0.2;
  const segments = computeSpeechSegments(srcIn, srcOut, clipStart, silences, padding);
  console.log(`[DERUST] ${segments.length} speech segment(s):`);
  for (const seg of segments) {
    console.log(`  pos=${seg.position.toFixed(3)} src=[${seg.srcIn.toFixed(3)}-${seg.srcOut.toFixed(3)}]`);
  }

  if (segments.length === 0) {
    throw new Error("Aucun segment de parole trouvé");
  }

  // 3. Trim original tail on audio AND video (if linked)
  const lastSeg = segments[segments.length - 1];
  const lastSegEnd = lastSeg.position + (lastSeg.srcOut - lastSeg.srcIn);

  onProgress?.(1, segments.length + 1, "Préparation...");

  // Trim audio tail
  await safeTransaction(project, "Trim audio tail", (ca: any) => {
    ca.addAction(clip.createSetEndAction(ppro.TickTime.createWithSeconds(lastSegEnd)));
  });
  console.log(`[DERUST] Trimmed audio tail to ${lastSegEnd.toFixed(3)}s`);

  // Trim video tail (if source has video — linked clips)
  const videoTrackCount = await sequence.getVideoTrackCount();
  for (let vt = 0; vt < videoTrackCount; vt++) {
    const vTrack = await sequence.getVideoTrack(vt);
    const vItems = vTrack.getTrackItems(1, false);
    for (const vItem of vItems) {
      const vEnd = (await vItem.getEndTime()).seconds;
      if (vEnd > lastSegEnd + 0.1) {
        await safeTransaction(project, "Trim video tail", (ca: any) => {
          ca.addAction(vItem.createSetEndAction(ppro.TickTime.createWithSeconds(lastSegEnd)));
        });
        console.log(`[DERUST] Trimmed video tail on V${vt + 1} from ${vEnd.toFixed(3)}s to ${lastSegEnd.toFixed(3)}s`);
      }
    }
  }

  // 4. Overwrite each speech segment on top of the original
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    onProgress?.(i + 2, segments.length + 1, `Segment ${i + 1}/${segments.length}...`);

    // Set ProjectItem in/out (clipPI from tree = cast)
    await safeTransaction(project, "Set in/out", (ca: any) => {
      ca.addAction(clipPI.createSetInOutPointsAction(
        ppro.TickTime.createWithSeconds(seg.srcIn),
        ppro.TickTime.createWithSeconds(seg.srcOut),
      ));
    });

    // Overwrite at position (projectItem from tree = raw)
    await safeTransaction(project, "Insert segment", (ca: any) => {
      ca.addAction(editor.createOverwriteItemAction(
        projectItem,
        ppro.TickTime.createWithSeconds(seg.position),
        -1, trackIndex,
      ));
    });

    console.log(`[DERUST] Segment ${i + 1} at ${seg.position.toFixed(3)}s [${seg.srcIn.toFixed(3)}-${seg.srcOut.toFixed(3)}]`);
  }

  const durationSaved = silences.reduce((sum, s) => sum + s.duration, 0);
  console.log(`[DERUST] Done: ${segments.length} segments, ${durationSaved.toFixed(1)}s removed`);

  return { removed: silences.length, durationSaved };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute speech segments by inverting silence regions.
 * Adds padding around each segment for smooth transitions.
 */
function computeSpeechSegments(
  srcIn: number, srcOut: number, clipStart: number,
  silences: Silence[], padding: number,
): SpeechSegment[] {
  const PADDING = padding;

  // Convert silence timeline positions to source-relative positions
  const srcSilences = silences
    .map(s => ({
      start: Math.max(srcIn, s.start - clipStart + srcIn),
      end: Math.min(srcOut, s.end - clipStart + srcIn),
    }))
    .filter(s => s.end > s.start);

  // Build speech segments (gaps between silences) with padding
  const segments: SpeechSegment[] = [];
  let cursor = srcIn;
  let position = 0;

  for (const silence of srcSilences) {
    if (silence.start > cursor + 0.01) {
      const padIn = Math.max(srcIn, cursor - PADDING);
      const padOut = Math.min(srcOut, silence.start + PADDING);
      const duration = padOut - padIn;
      segments.push({ srcIn: padIn, srcOut: padOut, position });
      position += duration;
    }
    cursor = silence.end;
  }

  // Last segment after final silence
  if (cursor < srcOut - 0.01) {
    const padIn = Math.max(srcIn, cursor - PADDING);
    const duration = srcOut - padIn;
    segments.push({ srcIn: padIn, srcOut, position });
  }

  return segments;
}

/**
 * Find a ProjectItem by name in the project tree (recursive).
 */
async function findProjectItemByName(folder: any, name: string): Promise<any | null> {
  const items = await folder.getItems();
  for (const item of items) {
    try {
      const f = ppro.FolderItem.cast(item);
      const found = await findProjectItemByName(f, name);
      if (found) return found;
      continue;
    } catch { /* not a folder */ }
    if (item.name === name) return item;
  }
  return null;
}

/**
 * Merge silences separated by less than `gap` seconds.
 */
function mergeSilences(silences: Silence[], gap: number): Silence[] {
  if (silences.length === 0) return [];

  const result: Silence[] = [{ ...silences[0] }];

  for (let i = 1; i < silences.length; i++) {
    const prev = result[result.length - 1];
    const curr = silences[i];

    if (curr.start - prev.end <= gap) {
      prev.end = curr.end;
      prev.duration = prev.end - prev.start;
    } else {
      result.push({ ...curr });
    }
  }

  return result;
}
