/**
 * Audio Enhancement Job
 *
 * Optimizes audio quality (loudnorm, HPF, limiter) for selected tracks.
 *
 * Strategy: export the FULL source audio once, optimize as one file,
 * then overwrite each timeline clip with the optimized version.
 * This avoids exporting 70+ clips individually after derushing.
 */

import * as premiereProAPI from '../api/premiereProAPI';
import { safeTransaction } from '../api/premiereProAPI';
import { backendClient } from '../api/backendAPI';
import { exportAudioSegment, deleteLocalFile } from '../api/ameAPI';
import type { OptimizationResponse } from '@/core/types';

const ppro = window.require("premierepro") as any;

/**
 * Load audio tracks from active sequence
 */
export async function loadAudioTracks(): Promise<{
  tracks: Array<{ id: number; name: string; duration: string; clips: number }>;
  projectDir: string;
}> {
  console.log("[JOB] loadAudioTracks() started");

  const availableTracks = await premiereProAPI.getAvailableAudioTracks();
  const tracksWithMetadata = [];

  for (const track of availableTracks) {
    try {
      const trackInfo = await premiereProAPI.analyzeAudioTrack(track.index);
      let totalDuration = 0;
      for (const clip of trackInfo.clips) {
        totalDuration += clip.sourceDuration;
      }
      const minutes = Math.floor(totalDuration / 60);
      const seconds = Math.floor(totalDuration % 60);
      tracksWithMetadata.push({
        id: track.index,
        name: track.name,
        duration: `${minutes}:${seconds.toString().padStart(2, '0')}`,
        clips: trackInfo.clipCount,
      });
    } catch {
      tracksWithMetadata.push({ id: track.index, name: track.name, duration: "0:00", clips: 0 });
    }
  }

  const project = await premiereProAPI.getActiveProject();
  const projectDir = project.path.split('/').slice(0, -1).join('/');

  return { tracks: tracksWithMetadata, projectDir };
}

/**
 * Optimize audio for selected tracks.
 *
 * For each track:
 * 1. Export full source audio ONCE via AME
 * 2. Upload + optimize on backend (single file)
 * 3. Download optimized file
 * 4. Import into PPro project
 * 5. Overwrite each clip with the optimized version (same in/out points)
 */
export async function optimizeAudio(
  selectedTracks: Array<{ index: number; filterType: 'voice' | 'music' | 'sound_effects' }>,
  outputDir: string,
  onProgress?: (msg: string) => void,
): Promise<OptimizationResponse> {
  console.log(`[JOB] optimizeAudio() started — ${selectedTracks.length} track(s)`);

  const project = await premiereProAPI.getActiveProject();
  const sequence = await premiereProAPI.getActiveSequence();
  const editor = ppro.SequenceEditor.getEditor(sequence);
  let totalProcessingTime = 0;

  const allTrackResults: any[] = [];

  for (const selected of selectedTracks) {
    const trackInfo = await premiereProAPI.analyzeAudioTrack(selected.index);
    if (trackInfo.clips.length === 0) continue;

    const clips = trackInfo.clips;
    const sourceFile = clips[0].sourceFilePath;
    const maxOut = Math.max(...clips.map(c => c.sourceOutPoint));

    console.log(`[JOB] Track ${selected.index}: ${clips.length} clips, source range [0-${maxOut.toFixed(1)}s]`);

    // 1. Export full source audio once
    onProgress?.("Export audio...");
    const localPath = await exportAudioSegment(sourceFile, 0, maxOut, `optimize_t${selected.index}`, "optimize");
    const serverPath = await backendClient.uploadAudio(localPath);
    await deleteLocalFile(localPath);
    console.log("[JOB] Full source uploaded");

    // 2. Backend optimizes single file
    onProgress?.("Optimisation en cours...");
    const response = await backendClient.optimizeAudio(
      [{
        trackIndex: selected.index,
        filterType: selected.filterType,
        clips: [{
          clipName: `full_t${selected.index}`,
          sourceFilePath: serverPath,
          sourceInPoint: 0,
          sourceOutPoint: maxOut,
          timelineStart: 0,
          timelineEnd: maxOut,
          preextracted: true,
        }],
      }],
      maxOut,
    );

    if (!response.success || !response.optimizedTracks?.length) {
      throw new Error(`Optimization failed for track ${selected.index}`);
    }

    totalProcessingTime += response.processingTime || 0;
    const optimizedServerPath = response.optimizedTracks[0].clips[0].optimizedPath;

    // 3. Download optimized file
    onProgress?.("Téléchargement...");
    const localOptimized = await backendClient.downloadOptimizedFile(optimizedServerPath, outputDir);
    console.log(`[JOB] Downloaded → ${localOptimized}`);

    // 4. Import into PPro project
    await project.importFiles([localOptimized]);

    // Wait for import to be visible in project tree
    const rootItem = await project.getRootItem();
    const optimizedFilename = localOptimized.split('/').pop()!;
    let optimizedPI: any = null;
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      optimizedPI = await findItemByName(rootItem, optimizedFilename);
      if (optimizedPI) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!optimizedPI) {
      throw new Error(`Optimized file not found in project: ${optimizedFilename}`);
    }

    const optimizedCast = ppro.ClipProjectItem.cast(optimizedPI);
    console.log(`[JOB] Found optimized in project: ${optimizedFilename}`);

    // 5. Overwrite each clip with the optimized version
    console.log(`[JOB] Placing ${clips.length} optimized clip(s)...`);

    // Find an empty track or use next available
    const emptyTrackIdx = await findEmptyAudioTrack(sequence);
    const targetTrack = emptyTrackIdx >= 0 ? emptyTrackIdx : await sequence.getAudioTrackCount();
    console.log(`[JOB] Target track: Audio ${targetTrack + 1}`);

    for (let ci = 0; ci < clips.length; ci++) {
      const clip = clips[ci];
      onProgress?.(`Insertion clip ${ci + 1}/${clips.length}...`);

      // Transaction 1: set in/out on ProjectItem
      await safeTransaction(project, "Set in/out", (ca: any) => {
        ca.addAction(optimizedCast.createSetInOutPointsAction(
          ppro.TickTime.createWithSeconds(clip.sourceInPoint),
          ppro.TickTime.createWithSeconds(clip.sourceOutPoint),
        ));
      });

      // Transaction 2: overwrite at position (uses the committed in/out)
      await safeTransaction(project, "Place clip", (ca: any) => {
        ca.addAction(editor.createOverwriteItemAction(
          optimizedPI,
          ppro.TickTime.createWithSeconds(clip.timelineStart),
          -1, targetTrack,
        ));
      });

      // Queue: pause between each clip to let PPro process
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[JOB] Track ${selected.index} done`);
    allTrackResults.push({
      trackIndex: selected.index,
      filterType: selected.filterType,
      clips: clips.map(c => ({
        clipName: c.clipName,
        optimizedPath: optimizedServerPath,
        duration: c.sourceDuration,
        timelineStart: c.timelineStart,
        timelineEnd: c.timelineEnd,
      })),
    });
  }

  console.log("[JOB] optimizeAudio() completed");

  return {
    success: true,
    optimizedTracks: allTrackResults,
    processingTime: totalProcessingTime,
    outputDirectory: outputDir,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function findItemByName(folder: any, name: string): Promise<any | null> {
  const items = await folder.getItems();
  for (const item of items) {
    try {
      const f = ppro.FolderItem.cast(item);
      const found = await findItemByName(f, name);
      if (found) return found;
      continue;
    } catch { /* not a folder */ }
    if (item.name === name) return item;
  }
  return null;
}

async function findEmptyAudioTrack(sequence: any): Promise<number> {
  const count = await sequence.getAudioTrackCount();
  for (let i = 0; i < count; i++) {
    const track = await sequence.getAudioTrack(i);
    const items = track.getTrackItems(1, false);
    if (items.length === 0) return i;
  }
  return -1;
}
