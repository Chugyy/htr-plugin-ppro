/**
 * Adobe Media Encoder API
 * Local audio extraction via AME before upload to backend
 */

const ppro = window.require("premierepro") as any;
const uxp = window.require("uxp") as any;

const PRESET_FILENAME = "htr-whisper.epr";
let _presetNativePath: string | null = null;

// ========================================
// PRESET INIT
// ========================================

/**
 * Get native path to the WAV 16kHz mono preset.
 * Copies the bundled preset to the plugin data folder on first call.
 */
async function getPresetPath(): Promise<string> {
  if (_presetNativePath) return _presetNativePath;

  const dataFolder = await uxp.storage.localFileSystem.getDataFolder();

  try {
    const existing = await dataFolder.getEntry(PRESET_FILENAME);
    _presetNativePath = existing.nativePath;
  } catch {
    // Copy bundled preset from plugin assets to data folder
    const pluginPresetUrl = new URL(`../../../assets/${PRESET_FILENAME}`, import.meta.url).href;
    const res = await fetch(pluginPresetUrl);
    if (!res.ok) throw new Error(`Could not load bundled preset: ${PRESET_FILENAME}`);
    const text = await res.text();

    const entry = await dataFolder.createFile(PRESET_FILENAME, { overwrite: true });
    await entry.write(text, { format: uxp.storage.formats.utf8 });
    _presetNativePath = entry.nativePath;
  }

  console.log(`[AME] Preset path: ${_presetNativePath}`);
  return _presetNativePath!;
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
 */
export async function exportAudioSegment(
  sourceFilePath: string,
  inPoint: number,
  outPoint: number,
  clipName: string
): Promise<string> {
  const manager = ppro.EncoderManager.getManager();

  if (!manager.isAMEInstalled) {
    throw new Error("Adobe Media Encoder n'est pas installé");
  }

  const presetPath = await getPresetPath();
  const dataFolder = await uxp.storage.localFileSystem.getDataFolder();
  const safeName = clipName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  const outputName = `${safeName}_${Date.now()}.wav`;
  const outputPath = `${dataFolder.nativePath}/${outputName}`;

  const inTickTime = ppro.TickTime.createWithSeconds(inPoint);
  const outTickTime = ppro.TickTime.createWithSeconds(outPoint);

  console.log(`[AME] Encoding: ${clipName} (${inPoint.toFixed(2)}s → ${outPoint.toFixed(2)}s)`);
  console.log(`[AME] Output: ${outputPath}`);

  await new Promise<void>((resolve, reject) => {
    const TIMEOUT_MS = 300_000; // 5 min
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`AME export timeout for: ${clipName}`));
    }, TIMEOUT_MS);

    const onComplete = () => { cleanup(); resolve(); };
    const onError   = () => { cleanup(); reject(new Error(`AME export failed for: ${clipName}`)); };
    const onCancel  = () => { cleanup(); reject(new Error(`AME export cancelled for: ${clipName}`)); };

    function cleanup() {
      clearTimeout(timer);
      try { manager.removeEventListener(ppro.EncoderManager.EVENT_RENDER_COMPLETE, onComplete); } catch {}
      try { manager.removeEventListener(ppro.EncoderManager.EVENT_RENDER_ERROR,    onError);   } catch {}
      try { manager.removeEventListener(ppro.EncoderManager.EVENT_RENDER_CANCEL,   onCancel);  } catch {}
    }

    manager.addEventListener(ppro.EncoderManager.EVENT_RENDER_COMPLETE, onComplete);
    manager.addEventListener(ppro.EncoderManager.EVENT_RENDER_ERROR,    onError);
    manager.addEventListener(ppro.EncoderManager.EVENT_RENDER_CANCEL,   onCancel);

    manager.encodeFile(
      sourceFilePath,
      outputPath,
      presetPath,
      inTickTime,
      outTickTime,
      0,     // workArea: 0 = full range defined by inPoint/outPoint
      false, // removeUponCompletion
      true   // startQueueImmediately
    ).catch((err: Error) => { cleanup(); reject(err); });
  });

  console.log(`[AME] Export complete: ${outputName}`);
  return outputPath;
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
