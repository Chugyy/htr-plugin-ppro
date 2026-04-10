/**
 * Adobe Media Encoder API
 * Local audio extraction via AME before upload to backend
 */

const ppro = window.require("premierepro") as any;
const uxp = window.require("uxp") as any;

export type PresetType = "whisper" | "optimize";

const PRESET_FILES: Record<PresetType, string> = {
  whisper: "htr-whisper.epr",    // 16kHz mono 16-bit (transcription)
  optimize: "htr-optimize.epr",  // 48kHz stereo 24-bit (audio optimization)
};

const _presetCache: Partial<Record<PresetType, string>> = {};

// ========================================
// PRESET INIT
// ========================================

/**
 * Get native path to a preset file.
 * Copies the bundled preset to the plugin data folder on first call.
 */
async function getPresetPath(type: PresetType = "whisper"): Promise<string> {
  if (_presetCache[type]) return _presetCache[type]!;

  const filename = PRESET_FILES[type];
  const dataFolder = await uxp.storage.localFileSystem.getDataFolder();

  try {
    const existing = await dataFolder.getEntry(filename);
    _presetCache[type] = existing.nativePath;
  } catch {
    const pluginPresetUrl = new URL(`../../../assets/${filename}`, import.meta.url).href;
    const res = await fetch(pluginPresetUrl);
    if (!res.ok) throw new Error(`Could not load bundled preset: ${filename}`);
    const text = await res.text();

    const entry = await dataFolder.createFile(filename, { overwrite: true });
    await entry.write(text, { format: uxp.storage.formats.utf8 });
    _presetCache[type] = entry.nativePath;
  }

  console.log(`[AME] Preset path (${type}): ${_presetCache[type]}`);
  return _presetCache[type]!;
}

// ========================================
// EXPORT
// ========================================

/**
 * Export a specific audio segment from a source video file using AME.
 * Returns the native path of the exported WAV file in the plugin data folder.
 *
 * @param sourceFilePath - Absolute path to source video/audio file
 * @param inPoint        - Start time in seconds
 * @param outPoint       - End time in seconds
 * @param clipName       - Used to name the output file
 * @param preset         - "whisper" (16kHz mono) or "optimize" (48kHz stereo 24-bit)
 */
let _exportCounter = 0;

// Bytes per second by preset (for file-size validation)
const _BYTES_PER_SEC: Record<PresetType, number> = {
  whisper: 32_000,   // 16kHz × 1ch × 2 bytes (16-bit)
  optimize: 288_000, // 48kHz × 2ch × 3 bytes (24-bit)
};

export async function exportAudioSegment(
  sourceFilePath: string,
  inPoint: number,
  outPoint: number,
  clipName: string,
  preset: PresetType = "whisper",
): Promise<string> {
  const manager = ppro.EncoderManager.getManager();

  if (!manager.isAMEInstalled) {
    throw new Error("Adobe Media Encoder n'est pas installé");
  }

  const presetPath = await getPresetPath(preset);
  const dataFolder = await uxp.storage.localFileSystem.getDataFolder();
  const safeName = clipName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  const outputName = `${safeName}_${Date.now()}_${++_exportCounter}.wav`;
  const outputPath = `${dataFolder.nativePath}/${outputName}`;

  const inTickTime = ppro.TickTime.createWithSeconds(inPoint);
  const outTickTime = ppro.TickTime.createWithSeconds(outPoint);
  const clipDuration = outPoint - inPoint;

  console.log(`[AME] Encoding: ${clipName} (${inPoint.toFixed(2)}s → ${outPoint.toFixed(2)}s, ${clipDuration.toFixed(1)}s)`);
  console.log(`[AME] Output: ${outputPath}`);

  manager.encodeFile(
    sourceFilePath,
    outputPath,
    presetPath,
    inTickTime,
    outTickTime,
    1,           // workArea: 1 = ENCODE_IN_TO_OUT
    false,       // removeUponCompletion
    true         // startQueueImmediately
  );

  // Dynamic timeout: max(60s, clipDuration × 2) — long clips need more time
  const TIMEOUT_MS = Math.max(60_000, clipDuration * 2_000);
  const deadline   = Date.now() + TIMEOUT_MS;

  const expectedMinSize = clipDuration * _BYTES_PER_SEC[preset] * 0.8;

  // Poll interval: 1s for short clips, 3s for long clips (reduces false positives)
  const POLL_INTERVAL = clipDuration > 120 ? 3_000 : 1_000;

  // Stability threshold: 5 consecutive polls with same size (vs 2 before)
  const STABLE_THRESHOLD = 5;

  let lastSize     = -1;
  let stableCount  = 0;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    try {
      const entry = await dataFolder.getEntry(outputName);
      const meta  = await entry.getMetadata();
      const size: number = meta.size ?? 0;
      console.log(`[AME] Poll: ${outputName} size=${size} (expected≥${Math.round(expectedMinSize)})`);

      if (size > 0 && size === lastSize) {
        stableCount++;
        // Only consider done if: stable enough AND file size is plausible
        if (stableCount >= STABLE_THRESHOLD && size >= expectedMinSize) {
          console.log(`[AME] Poll: stable at ${size} bytes after ${stableCount} polls → done`);
          break;
        }
        // Safety: if stable for a very long time but size is small, AME may have errored
        if (stableCount >= STABLE_THRESHOLD * 3) {
          console.warn(`[AME] Poll: file stuck at ${size} bytes (expected ≥${Math.round(expectedMinSize)}) — accepting as-is`);
          break;
        }
      } else {
        stableCount = 0;
        lastSize = size;
      }
    } catch {
      console.log(`[AME] Poll: ${outputName} not found yet`);
    }
  }

  if (Date.now() >= deadline) {
    throw new Error(`AME export timeout (${Math.round(TIMEOUT_MS / 1000)}s) for: ${clipName} (${clipDuration.toFixed(1)}s)`);
  }

  console.log(`[AME] Export complete: ${outputName}`);
  return outputPath;
}

// ========================================
// SEQUENCE EXPORT
// ========================================

/**
 * Export the active sequence's full audio mix via PPro's built-in encoder.
 * Returns the native path of the exported WAV file.
 *
 * Unlike encodeFile (which exports a source file segment), this renders
 * the sequence timeline — including nested sequences, transitions, and effects.
 */
export async function exportSequenceAudio(
  sequence: any,
  preset: PresetType = "whisper",
): Promise<string> {
  const presetPath = await getPresetPath(preset);
  const dataFolder = await uxp.storage.localFileSystem.getDataFolder();
  const outputName = `seq_export_${Date.now()}_${++_exportCounter}.wav`;
  const outputPath = `${dataFolder.nativePath}/${outputName}`;

  const EM = ppro.EncoderManager;
  const manager = EM.getManager();

  console.log(`[AME] exportSequenceAudio: ${outputPath}`);

  const ok = await manager.exportSequence(
    sequence,
    EM.EXPORT_IMMEDIATELY,
    outputPath,
    presetPath,
  );

  if (!ok) {
    throw new Error("exportSequence returned false — export failed");
  }

  // EXPORT_IMMEDIATELY is synchronous-ish but verify file exists with stability check
  const TIMEOUT_MS = 60_000;
  const deadline = Date.now() + TIMEOUT_MS;
  const POLL_INTERVAL = 1_000;
  const STABLE_THRESHOLD = 3;
  let lastSize = -1;
  let stableCount = 0;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    try {
      const entry = await dataFolder.getEntry(outputName);
      const meta = await entry.getMetadata();
      const size: number = meta.size ?? 0;

      if (size > 0 && size === lastSize) {
        stableCount++;
        if (stableCount >= STABLE_THRESHOLD && size >= 1000) {
          console.log(`[AME] exportSequenceAudio: stable at ${size} bytes`);
          return outputPath;
        }
      } else {
        stableCount = 0;
        lastSize = size;
      }
    } catch { /* file not ready yet */ }
  }

  throw new Error(`exportSequenceAudio timeout (${TIMEOUT_MS / 1000}s)`);
}

// ========================================
// CLEANUP
// ========================================

/**
 * Delete a local file produced by exportAudioSegment.
 */
export async function deleteLocalFile(nativePath: string): Promise<void> {
  try {
    const entry = await uxp.storage.localFileSystem.getEntryForNativePath(nativePath);
    await entry.delete();
    console.log(`[AME] Deleted local file: ${nativePath}`);
  } catch {
    // Non-blocking — ignore cleanup errors
  }
}
