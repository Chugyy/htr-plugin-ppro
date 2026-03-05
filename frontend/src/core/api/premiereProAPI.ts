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
  ClipWithTranscript
} from '@/core/types';

// Get Premiere Pro API
const ppro = window.require("premierepro") as PremiereProAPI;

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
 * TYPE_BIN = 2, TYPE_ROOT = 3 → recurse; anything else → store as clip
 */
async function scanItemsIntoMap(
  folderItem: any,
  map: Map<string, any>
): Promise<void> {
  const items = await folderItem.getItems();
  for (const item of items) {
    if (item.type === 2 || item.type === 3) {
      await scanItemsIntoMap(item, map);
    } else {
      console.log(`[PPRO] Scanned item: "${item.name}" (type=${item.type})`);
      map.set(item.name, item);
    }
  }
}

/**
 * Import optimized WAV clips into a new audio track in the active sequence.
 * One new track per original track, clips placed at their original timeline positions.
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
  }>
): Promise<void> {
  const { backendClient } = await import('@/core/api/backendAPI');
  const uxp = window.require("uxp") as any;
  const project = await getActiveProject();
  const sequence = await getActiveSequence();

  // 1. Download optimized files from backend to local UXP data folder
  const allServerPaths = optimizedTracks.flatMap(t => t.clips.map(c => c.optimizedPath));
  console.log(`[PPRO:1] Downloading ${allServerPaths.length} optimized file(s) from backend...`);
  const localPaths = await Promise.all(allServerPaths.map(p => backendClient.downloadOptimizedFile(p)));
  const serverToLocal = new Map(allServerPaths.map((s, i) => [s, localPaths[i]]));
  console.log(`[PPRO:1] Downloaded — local paths:`, localPaths);

  // 2. Import local files into Premiere project
  const importOk = await project.importFiles(localPaths, true);
  console.log(`[PPRO:2] importFiles — result: ${importOk}`);

  // 3. Poll until all imported items appear in the project tree
  const rootItem = await project.getRootItem();
  const expectedFiles = new Set(localPaths.map(p => p.split('/').pop()!));
  const itemMap = new Map<string, any>();
  const POLL_TIMEOUT = 30_000;
  const deadline = Date.now() + POLL_TIMEOUT;

  while (Date.now() < deadline) {
    itemMap.clear();
    await scanItemsIntoMap(rootItem, itemMap);
    const found = [...expectedFiles].filter(f => itemMap.has(f)).length;
    console.log(`[PPRO:3] polling items: ${found}/${expectedFiles.size}`);
    if (found === expectedFiles.size) break;
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`[PPRO:3] itemMap ready — size: ${itemMap.size}`);

  // 3. Get current track count — new tracks start after existing ones
  console.log(`[PPRO:3] getAudioTrackCount...`);
  const baseTrackIndex = await sequence.getAudioTrackCount();
  console.log(`[PPRO:3] baseTrackIndex: ${baseTrackIndex}`);

  console.log(`[PPRO:4] getEditor...`);
  const editor = ppro.SequenceEditor.getEditor(sequence);
  console.log(`[PPRO:4] editor:`, editor);

  // 4. Place each clip on timeline in a single undoable transaction
  console.log(`[PPRO:5] starting lockedAccess + executeTransaction...`);
  project.lockedAccess(() => {
    project.executeTransaction((compoundAction) => {
      optimizedTracks.forEach((track, offset) => {
        const audioTrackIndex = baseTrackIndex + offset;
        track.clips.forEach((clip) => {
          const localPath = serverToLocal.get(clip.optimizedPath)!;
          const filename = localPath.split('/').pop()!;
          const projectItem = itemMap.get(filename);
          console.log(`[PPRO:5] clip "${filename}" → projectItem:`, projectItem, `| timelineStart: ${clip.timelineStart} (${typeof clip.timelineStart}) | audioTrackIndex: ${audioTrackIndex} (${typeof audioTrackIndex})`);
          if (!projectItem) {
            console.warn(`[PPRO:5] SKIP — item not found: "${filename}"`);
            return;
          }
          console.log(`[PPRO:5] createWithSeconds(${clip.timelineStart})...`);
          const tickTime = ppro.TickTime.createWithSeconds(clip.timelineStart);
          console.log(`[PPRO:5] tickTime:`, tickTime);
          console.log(`[PPRO:5] createOverwriteItemAction(projectItem, tickTime, -1, ${audioTrackIndex})...`);
          const action = editor.createOverwriteItemAction(
            projectItem,
            tickTime,
            -1,
            audioTrackIndex
          );
          console.log(`[PPRO:5] action:`, action);
          compoundAction.addAction(action);
        });
      });
    }, "Import Optimized Audio");
  });
  console.log(`[PPRO:6] lockedAccess done`);

  // 6. Cleanup local temp files (non-blocking)
  const dataFolder = await uxp.storage.localFileSystem.getDataFolder();
  await Promise.allSettled(
    localPaths.map(async (p) => {
      try {
        const entry = await dataFolder.getEntry(p.split('/').pop()!);
        await entry.delete();
      } catch {}
    })
  );
  console.log(`[PPRO:6] local temp files cleaned up`);
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
    project.lockedAccess(() => {
      success = project.executeTransaction((compoundAction) => {
        // Import JSON → TextSegments and create action INSIDE transaction
        const textSegments = ppro.Transcript.importFromJSON(jsonString);
        const importAction = ppro.Transcript.createImportTextSegmentsAction(
          textSegments,
          clipProjectItem
        );
        compoundAction.addAction(importAction);
      }, "Import Transcript");
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
      // Check if it's a folder (bin)
      if (item.type === 0) { // TYPE_BIN
        // Recursive scan
        await scanFolderForTranscripts(item, clips);
      }
      // Check if it's a clip
      else if (item.type === 1) { // TYPE_CLIP
        const clipProjectItem = ppro.ClipProjectItem.cast(item);

        // Get content type
        const contentType = await clipProjectItem.getContentType();

        // Only check sequences (contentType === 2)
        if (contentType === 2) {
          try {
            // Check if sequence has transcript
            const transcriptJSON = await ppro.Transcript.exportToJSON(clipProjectItem);
            if (transcriptJSON && transcriptJSON.trim() !== "") {
              clips.push({
                clipName: item.name,
                clipProjectItem: clipProjectItem,
                hasTranscript: true,
                isSequence: true
              });
              console.log(`[DEBUG] Found transcript in sequence: ${item.name}`);
            }
          } catch (error) {
            // No transcript in this sequence, continue
            console.log(`[DEBUG] No transcript in sequence: ${item.name}`);
          }
        }
      }
    }
  } catch (error) {
    console.error("[ERROR] scanFolderForTranscripts failed:", error);
    // Continue scanning even if one folder fails
  }
}
