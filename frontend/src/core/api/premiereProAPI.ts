/**
 * Premiere Pro API Layer
 * Consolidated from v2: project.ts, audio-analysis.ts, audio-extraction.ts, transcript.ts, caption-tracks.ts
 */

import type {
  PremiereProAPI,
  Project,
  Sequence,
  AudioTrackInfo,
  AudioClipInfo,
  PremiereTranscriptJSON,
  ClipProjectItem,
  ClipWithTranscript,
  VideoTrackInfo,
  VideoClipInfo,
  LumetriCorrections
} from '@/core/types';

// Get Premiere Pro API
const ppro = window.require("premierepro") as PremiereProAPI;
const uxp = window.require("uxp") as any;

// ========================================
// TRANSACTION SERIALIZATION
// ========================================

const TRANSACTION_DELAY = 150; // ms between transactions to avoid PPro crashes
let transactionChain: Promise<void> = Promise.resolve();

/**
 * Serialize PPro transactions: each waits for the previous one + 150ms gap.
 * Drop-in replacement for `project.lockedAccess(() => project.executeTransaction(...))`.
 */
export function safeTransaction(
  project: Project,
  label: string,
  fn: (compoundAction: any) => void,
): Promise<void> {
  transactionChain = transactionChain.then(async () => {
    project.lockedAccess(() => {
      project.executeTransaction(fn, label);
    });
    await new Promise(r => setTimeout(r, TRANSACTION_DELAY));
  });
  return transactionChain;
}

// ========================================
// PROJECT & SEQUENCE
// ========================================

/**
 * Get active project
 */
export async function getActiveProject(): Promise<Project> {
  const project = await ppro.Project.getActiveProject();
  if (!project) {
    throw new Error("No active project found");
  }
  return project;
}

/**
 * Get active sequence
 */
export async function getActiveSequence(): Promise<Sequence> {
  const project = await getActiveProject();
  const sequence = await project.getActiveSequence();
  if (!sequence) {
    throw new Error("No active sequence found");
  }
  return sequence;
}

/**
 * Get project info
 */
export async function getProjectInfo(): Promise<{ name: string; path: string; sequenceCount: number }> {
  const project = await getActiveProject();
  return {
    name: project.name,
    path: project.path,
    sequenceCount: project.sequences.length
  };
}

// ========================================
// AUDIO TRACKS
// ========================================

/**
 * Get list of available audio tracks in active sequence
 */
export async function getAvailableAudioTracks(): Promise<{ index: number; name: string }[]> {
  console.log("[DEBUG] getAvailableAudioTracks() called");

  const sequence = await getActiveSequence();
  const trackCount = await sequence.getAudioTrackCount();
  console.log(`[DEBUG] Found ${trackCount} audio tracks`);

  const tracks: { index: number; name: string }[] = [];

  for (let i = 0; i < trackCount; i++) {
    const track = await sequence.getAudioTrack(i);
    tracks.push({
      index: i,
      name: track.name || `Audio ${i + 1}`
    });
  }

  return tracks;
}

/**
 * Analyze a specific audio track and return all clip information
 */
export async function analyzeAudioTrack(trackIndex: number): Promise<AudioTrackInfo> {
  console.log(`[DEBUG] analyzeAudioTrack(${trackIndex}) called`);

  const sequence = await getActiveSequence();
  const audioTrack = await sequence.getAudioTrack(trackIndex);
  console.log(`[DEBUG] Got audio track: ${audioTrack.name}`);

  const isMuted = await audioTrack.isMuted();

  // Get track items (1 = CLIP type from Constants.TrackItemType enum)
  const trackItems = audioTrack.getTrackItems(1, false);
  console.log(`[DEBUG] Found ${trackItems.length} clips in track`);

  const clips: AudioClipInfo[] = [];

  for (let i = 0; i < trackItems.length; i++) {
    const trackItem = trackItems[i];
    console.log(`[DEBUG] Processing clip ${i + 1}/${trackItems.length}`);

    try {
      // Get clip name
      const clipName = await trackItem.getName();

      // Get project item (source file)
      const projectItem = await trackItem.getProjectItem();
      const clipProjectItem = ppro.ClipProjectItem.cast(projectItem);

      // Skip nested sequences (no source media file)
      const isSeq = await clipProjectItem.isSequence();
      if (isSeq) {
        console.warn(`[WARN] Skipping nested sequence on track ${trackIndex}: ${clipName}`);
        continue;
      }

      // Get source file path
      const sourceFilePath = await clipProjectItem.getMediaFilePath();

      // Get portion of source media used
      const inPoint = await trackItem.getInPoint();
      const outPoint = await trackItem.getOutPoint();
      const sourceInPoint = inPoint.seconds;
      const sourceOutPoint = outPoint.seconds;
      const sourceDuration = sourceOutPoint - sourceInPoint;

      // Get position in timeline
      const startTime = await trackItem.getStartTime();
      const endTime = await trackItem.getEndTime();
      const timelineStart = startTime.seconds;
      const timelineEnd = endTime.seconds;
      const timelineDuration = timelineEnd - timelineStart;

      clips.push({
        clipName,
        trackIndex,
        sourceFilePath,
        sourceInPoint,
        sourceOutPoint,
        sourceDuration,
        timelineStart,
        timelineEnd,
        timelineDuration
      });

      console.log(`[DEBUG] Clip ${i + 1}: ${clipName} (${sourceDuration.toFixed(2)}s)`);
    } catch (error) {
      console.error(`[ERROR] Failed to process clip ${i + 1}:`, error);
      // Continue with next clip
    }
  }

  return {
    trackIndex,
    trackName: audioTrack.name || `Audio ${trackIndex + 1}`,
    isMuted,
    clipCount: clips.length,
    clips
  };
}

/**
 * Analyze multiple audio tracks
 */
export async function analyzeMultipleAudioTracks(trackIndices: number[]): Promise<AudioTrackInfo[]> {
  console.log(`[DEBUG] analyzeMultipleAudioTracks(${trackIndices}) called`);

  const results: AudioTrackInfo[] = [];

  for (const trackIndex of trackIndices) {
    try {
      const trackInfo = await analyzeAudioTrack(trackIndex);
      results.push(trackInfo);
    } catch (error) {
      console.error(`[ERROR] Failed to analyze track ${trackIndex}:`, error);
      // Continue with next track
    }
  }

  return results;
}

/**
 * Extract audio clips from selected tracks
 */
export async function extractAudioClips(tracks: AudioTrackInfo[]): Promise<AudioClipInfo[]> {
  console.log(`[DEBUG] extractAudioClips() called with ${tracks.length} tracks`);

  const allClips: AudioClipInfo[] = [];

  for (const track of tracks) {
    allClips.push(...track.clips);
  }

  console.log(`[DEBUG] Total clips extracted: ${allClips.length}`);
  return allClips;
}

// ========================================
// AUDIO OPTIMIZATION IMPORT
// ========================================

/**
 * Recursively scan a folder item and collect all ProjectItems into a map keyed by filename.
 * Uses FolderItem.cast + getItems() — only recurses into actual folders.
 */
async function scanItemsIntoMap(
  folderItem: any,
  map: Map<string, any>
): Promise<void> {
  const items = await folderItem.getItems();
  for (const item of items) {
    try {
      const folder = ppro.FolderItem.cast(item);
      await scanItemsIntoMap(folder, map);
    } catch {
      console.log(`[PPRO] Scanned item: "${item.name}" (type=${item.type})`);
      map.set(item.name, item);
    }
  }
}

/**
 * Find empty audio tracks in the active sequence.
 * A track is empty when it has zero CLIP-type items.
 */
async function findEmptyAudioTracks(sequence: Sequence): Promise<number[]> {
  const trackCount = await sequence.getAudioTrackCount();
  const emptyIndices: number[] = [];

  for (let i = 0; i < trackCount; i++) {
    const track = await sequence.getAudioTrack(i);
    const items = track.getTrackItems(1, false); // 1 = CLIP type
    if (items.length === 0) {
      emptyIndices.push(i);
    }
  }

  console.log(`[PPRO] Empty audio tracks: [${emptyIndices.join(', ')}] out of ${trackCount}`);
  return emptyIndices;
}

/**
 * Import optimized WAV clips into the active sequence.
 * Reuses empty audio tracks first, creates new ones only when needed.
 * Clips are placed at their original timeline positions (synchronized alter-ego).
 */
export async function importOptimizedClips(
  optimizedTracks: Array<{
    trackIndex: number;
    filterType: string;
    clips: Array<{
      clipName: string;
      optimizedPath: string;
      duration: number;
      timelineStart: number;
      timelineEnd: number;
    }>;
  }>,
  outputDir: string
): Promise<void> {
  const { backendClient } = await import('@/core/api/backendAPI');
  const project = await getActiveProject();
  const sequence = await getActiveSequence();

  // 1. Download optimized files from backend
  const allServerPaths = optimizedTracks.flatMap(t => t.clips.map(c => c.optimizedPath));
  console.log(`[PPRO:1] Downloading ${allServerPaths.length} optimized file(s)...`);
  const localPaths = await Promise.all(allServerPaths.map(p => backendClient.downloadOptimizedFile(p, outputDir)));
  const serverToLocal = new Map(allServerPaths.map((s, i) => [s, localPaths[i]]));

  // 2. Import into Premiere project
  await project.importFiles(localPaths, true);

  // 3. Poll until all imported items appear in project tree
  const rootItem = await project.getRootItem();
  const expectedFiles = new Set(localPaths.map(p => p.split('/').pop()!));
  const itemMap = new Map<string, any>();
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    itemMap.clear();
    await scanItemsIntoMap(rootItem, itemMap);
    if ([...expectedFiles].every(f => itemMap.has(f))) break;
    await new Promise(r => setTimeout(r, 500));
  }

  // 4. Assign target tracks: reuse empty ones first, then overflow to new indices
  const emptyTracks = await findEmptyAudioTracks(sequence);
  const totalTracks = await sequence.getAudioTrackCount();
  const trackAssignments: number[] = [];
  let overflowOffset = 0;

  for (let i = 0; i < optimizedTracks.length; i++) {
    if (i < emptyTracks.length) {
      trackAssignments.push(emptyTracks[i]);
    } else {
      trackAssignments.push(totalTracks + overflowOffset);
      overflowOffset++;
    }
  }
  console.log(`[PPRO:4] Track assignments: ${optimizedTracks.map((t, i) => `Track ${t.trackIndex} → audio ${trackAssignments[i]}`).join(', ')}`);

  // 5. Place clips in a single undoable transaction
  const editor = ppro.SequenceEditor.getEditor(sequence);
  await safeTransaction(project, "Import Optimized Audio", (compoundAction) => {
    optimizedTracks.forEach((track, i) => {
      const audioTrackIndex = trackAssignments[i];
      track.clips.forEach((clip) => {
        const localPath = serverToLocal.get(clip.optimizedPath)!;
        const filename = localPath.split('/').pop()!;
        const projectItem = itemMap.get(filename);
        if (!projectItem) {
          console.warn(`[PPRO:5] SKIP — item not found: "${filename}"`);
          return;
        }
        const tickTime = ppro.TickTime.createWithSeconds(clip.timelineStart);
        const action = editor.createOverwriteItemAction(projectItem, tickTime, -1, audioTrackIndex);
        compoundAction.addAction(action);
      });
    });
  });
  console.log(`[PPRO:6] Import done — ${optimizedTracks.reduce((n, t) => n + t.clips.length, 0)} clip(s) placed`);
}

// ========================================
// SEQUENCE → CLIP PROJECT ITEM
// ========================================

/**
 * Get the ClipProjectItem of the active sequence (works regardless of bin location)
 */
export async function getActiveSequenceClipItem(): Promise<ClipProjectItem> {
  const sequence = await getActiveSequence();
  const projectItem = await sequence.getProjectItem();
  return ppro.ClipProjectItem.cast(projectItem);
}

// ========================================
// TRANSCRIPT / CAPTIONS
// ========================================

/**
 * Import transcript JSON into a Premiere Pro clip
 */
export async function importTranscript(
  transcriptJSON: PremiereTranscriptJSON,
  clipProjectItem: ClipProjectItem
): Promise<boolean> {
  try {
    console.log("[DEBUG] Importing transcript to clip...");

    // Convert JSON to string
    const jsonString = JSON.stringify(transcriptJSON);

    // Get project to execute transaction
    const project = await getActiveProject();

    // Execute transaction (undoable) with locked access
    let success = false;
    await safeTransaction(project, "Import Transcript", (compoundAction) => {
      const textSegments = ppro.Transcript.importFromJSON(jsonString);
      const importAction = ppro.Transcript.createImportTextSegmentsAction(
        textSegments,
        clipProjectItem
      );
      compoundAction.addAction(importAction);
      success = true;
    });

    console.log("[DEBUG] Transcript import successful");
    return success;

  } catch (error) {
    console.error("[ERROR] importTranscript failed:", error);
    throw error;
  }
}

/**
 * Export transcript from a Premiere Pro clip to JSON
 */
export async function exportTranscript(
  clipProjectItem: ClipProjectItem
): Promise<PremiereTranscriptJSON | null> {
  try {
    console.log("[DEBUG] Exporting transcript from clip...");

    // Export from clip (async)
    const jsonString = await ppro.Transcript.exportToJSON(clipProjectItem);

    if (!jsonString || jsonString.trim() === "") {
      console.log("[DEBUG] No transcript found in clip");
      return null;
    }

    // Parse JSON
    const transcriptJSON = JSON.parse(jsonString) as PremiereTranscriptJSON;

    console.log("[DEBUG] Transcript exported successfully");
    console.log(`[DEBUG] - Language: ${transcriptJSON.language}`);
    console.log(`[DEBUG] - Segments: ${transcriptJSON.segments.length}`);

    // Calculate word count
    let wordCount = 0;
    for (const segment of transcriptJSON.segments) {
      wordCount += segment.words.length;
    }
    console.log(`[DEBUG] - Word count: ${wordCount}`);

    return transcriptJSON;

  } catch (error) {
    console.error("[ERROR] exportTranscript failed:", error);
    throw error;
  }
}

/**
 * Get all clips from project that have transcripts
 */
export async function getClipsWithTranscripts(): Promise<ClipWithTranscript[]> {
  console.log("[DEBUG] getClipsWithTranscripts() called");

  const project = await getActiveProject();
  const rootItem = await project.getRootItem();
  const clips: ClipWithTranscript[] = [];

  // Recursive function to scan all items
  await scanFolderForTranscripts(rootItem, clips);

  console.log(`[DEBUG] Found ${clips.length} clips with transcripts`);
  return clips;
}

/**
 * Recursively scan folder for clips with transcripts
 */
async function scanFolderForTranscripts(
  folderItem: any,
  clips: ClipWithTranscript[]
): Promise<void> {
  try {
    const items = await folderItem.getItems();

    for (const item of items) {
      // Try to recurse into folders
      try {
        const folder = ppro.FolderItem.cast(item);
        await scanFolderForTranscripts(folder, clips);
        continue;
      } catch { /* not a folder */ }

      // Try as clip — check if sequence with transcript
      try {
        const clipProjectItem = ppro.ClipProjectItem.cast(item);
        const isSeq = await clipProjectItem.isSequence();
        if (!isSeq) continue;

        const transcriptJSON = await ppro.Transcript.exportToJSON(clipProjectItem);
        if (transcriptJSON && transcriptJSON.trim() !== "") {
          clips.push({
            clipName: item.name,
            clipProjectItem,
            hasTranscript: true,
            isSequence: true
          });
          console.log(`[DEBUG] Found transcript in sequence: ${item.name}`);
        }
      } catch {
        // Not a valid clip or no transcript
      }
    }
  } catch (error) {
    console.error("[ERROR] scanFolderForTranscripts failed:", error);
  }
}

// ========================================
// VIDEO TRACKS & COLOR CORRECTION
// ========================================

/** Lumetri parameter index map (PPro 26.x, confirmed via test) */
const LUMETRI_PARAMS: Record<keyof LumetriCorrections, number> = {
  temperature: 14,
  tint: 15,
  saturation: 16,
  exposure: 19,
  contrast: 20,
  highlights: 21,
  shadows: 22,
  whites: 23,
  blacks: 24,
  vibrance: 42,
};

/**
 * Get all video tracks with their clips.
 */
export async function getVideoTracks(): Promise<VideoTrackInfo[]> {
  const sequence = await getActiveSequence();
  const trackCount = await sequence.getVideoTrackCount();
  const tracks: VideoTrackInfo[] = [];

  for (let t = 0; t < trackCount; t++) {
    const track = await sequence.getVideoTrack(t);
    const trackItems = track.getTrackItems(1, false); // 1 = CLIP
    if (trackItems.length === 0) continue;

    const clips: VideoClipInfo[] = [];
    for (const item of trackItems) {
      try {
        const clipName = await item.getName();
        const projectItem = await item.getProjectItem();
        const clipProjectItem = ppro.ClipProjectItem.cast(projectItem);
        const sourceFilePath = await clipProjectItem.getMediaFilePath();
        const startTime = await item.getStartTime();
        const endTime = await item.getEndTime();

        clips.push({
          clipName,
          trackIndex: t,
          sourceFilePath,
          timelineStart: startTime.seconds,
          timelineEnd: endTime.seconds,
          timelineDuration: endTime.seconds - startTime.seconds,
        });
      } catch { /* skip broken clips */ }
    }

    tracks.push({
      trackIndex: t,
      trackName: track.name || `Video ${t + 1}`,
      clipCount: clips.length,
      clips,
    });
  }

  return tracks;
}

/**
 * Export a frame from the active sequence at a given time.
 * Uses the plugin data folder (same as audio export), reads, deletes, returns ArrayBuffer.
 */
export async function exportFrame(
  timeSeconds: number,
  filename: string,
): Promise<ArrayBuffer> {
  const sequence = await getActiveSequence();
  const time = ppro.TickTime.createWithSeconds(timeSeconds);

  // Use dataFolder (same as ameAPI) — PPro can write there and we can read via getEntry
  const dataFolder = await uxp.storage.localFileSystem.getDataFolder();
  const outputDir = dataFolder.nativePath;

  // PPro appends .png to filename, so "frame_1.png" becomes "frame_1.png.png"
  const diskFilename = `${filename}.png`;

  const success = await ppro.Exporter.exportSequenceFrame(
    sequence, time, filename, outputDir, 1920, 1080
  );

  if (!success) throw new Error(`Frame export failed at t=${timeSeconds}s`);

  // Poll for file with size stability check (same pattern as AME export).
  // A 1920×1080 PNG is typically 500KB–3MB. We wait for the file to exist
  // AND have a stable size across 2 consecutive polls before reading.
  const TIMEOUT_MS = 15_000;
  const POLL_INTERVAL = 300;
  const STABLE_THRESHOLD = 2;
  const MIN_PNG_SIZE = 1_000; // minimum plausible PNG size in bytes

  const deadline = Date.now() + TIMEOUT_MS;
  let lastSize = -1;
  let stableCount = 0;
  let fileEntry: any = null;

  while (Date.now() < deadline) {
    try {
      fileEntry = await dataFolder.getEntry(diskFilename);
      const meta = await fileEntry.getMetadata();
      const size: number = meta.size ?? 0;

      if (size > 0 && size === lastSize) {
        stableCount++;
        if (stableCount >= STABLE_THRESHOLD && size >= MIN_PNG_SIZE) {
          console.log(`[PPRO] exportFrame: stable at ${size} bytes after ${stableCount} polls`);
          break;
        }
      } else {
        stableCount = 0;
        lastSize = size;
      }
    } catch { /* file not ready yet */ }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  if (!fileEntry || stableCount < STABLE_THRESHOLD) {
    throw new Error(`Frame export timeout or unstable: ${diskFilename}`);
  }

  const buffer: ArrayBuffer = await fileEntry.read({ format: uxp.storage.formats.binary });
  await fileEntry.delete();

  if (buffer.byteLength < MIN_PNG_SIZE) {
    throw new Error(`Frame export produced invalid file (${buffer.byteLength} bytes)`);
  }

  console.log(`[PPRO] exportFrame: done, ${buffer.byteLength} bytes`);
  return buffer;
}

/**
 * Apply Lumetri Color corrections to a single video clip.
 * Adds a new Lumetri effect and sets all parameters in one transaction.
 */
export async function applyLumetriToClip(
  trackIndex: number,
  clipIndex: number,
  corrections: LumetriCorrections,
): Promise<void> {
  const project = await getActiveProject();
  const sequence = await getActiveSequence();
  const track = await sequence.getVideoTrack(trackIndex);
  const clips = track.getTrackItems(1, false);
  const clip = clips[clipIndex];

  if (!clip) throw new Error(`Clip [${clipIndex}] not found on track ${trackIndex}`);

  // Create Lumetri component
  const lumetriComponent = await ppro.VideoFilterFactory.createComponent("AE.ADBE Lumetri");
  const chain = await clip.getComponentChain();

  // Add Lumetri effect
  await safeTransaction(project, "Apply Color Correction", (compoundAction: any) => {
    compoundAction.addAction(chain.createAppendComponentAction(lumetriComponent));
  });

  // Get the newly added Lumetri (last component)
  const updatedChain = await clip.getComponentChain();
  const compCount = updatedChain.getComponentCount();
  const lumetri = updatedChain.getComponentAtIndex(compCount - 1);

  // Set parameters
  await safeTransaction(project, "Set Color Correction Values", (compoundAction: any) => {
    for (const [key, paramIndex] of Object.entries(LUMETRI_PARAMS)) {
      const value = corrections[key as keyof LumetriCorrections];
      if (value === 0 && key !== 'saturation') continue; // skip defaults
      if (key === 'saturation' && value === 100) continue; // 100 = no change

      const param = lumetri.getParam(paramIndex);
      const keyframe = param.createKeyframe(value);
      compoundAction.addAction(param.createSetValueAction(keyframe));
    }
  });
}

/**
 * Check if a video clip has a Lumetri Color effect applied.
 */
export async function clipHasLumetri(
  trackIndex: number,
  clipIndex: number,
): Promise<boolean> {
  const sequence = await getActiveSequence();
  const track = await sequence.getVideoTrack(trackIndex);
  const clips = track.getTrackItems(1, false);
  const clip = clips[clipIndex];
  if (!clip) return false;

  const chain = await clip.getComponentChain();
  const compCount = chain.getComponentCount();
  for (let i = 0; i < compCount; i++) {
    const comp = chain.getComponentAtIndex(i);
    const matchName = await comp.getMatchName();
    if (matchName.includes('Lumetri')) return true;
  }
  return false;
}

/**
 * Remove the last Lumetri Color effect from a video clip.
 */
export async function removeLumetriFromClip(
  trackIndex: number,
  clipIndex: number,
): Promise<boolean> {
  const project = await getActiveProject();
  const sequence = await getActiveSequence();
  const track = await sequence.getVideoTrack(trackIndex);
  const clips = track.getTrackItems(1, false);
  const clip = clips[clipIndex];

  if (!clip) return false;

  const chain = await clip.getComponentChain();
  const compCount = chain.getComponentCount();

  // Find the last Lumetri in the chain
  for (let i = compCount - 1; i >= 0; i--) {
    const comp = chain.getComponentAtIndex(i);
    const matchName = await comp.getMatchName();
    if (matchName.includes('Lumetri')) {
      await safeTransaction(project, "Remove Color Correction", (compoundAction: any) => {
        compoundAction.addAction(chain.createRemoveComponentAction(comp));
      });
      return true;
    }
  }

  return false;
}

/**
 * Get the project directory path (parent of project file).
 */
export async function getProjectDirectory(): Promise<string> {
  const project = await getActiveProject();
  const projectPath = project.path;
  return projectPath.substring(0, projectPath.lastIndexOf('/'));
}
