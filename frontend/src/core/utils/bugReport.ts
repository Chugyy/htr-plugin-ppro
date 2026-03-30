/**
 * Automatic bug report — collects frontend logs, project state, system info
 * and sends everything to POST /bug-reports on every error.
 */

import { getLogsAsText } from '@/core/utils/logBuffer';
import { getRecentRequestIds } from '@/core/api/backendAPI';
import { authService } from '@/core/services/authService';

// Debounce: avoid sending duplicate reports for the same error in quick succession
let lastReportTime = 0;
const DEBOUNCE_MS = 5_000;

interface ProjectState {
  sequenceName?: string;
  audioTracks?: Array<{ name: string; clipCount: number }>;
  videoTracks?: Array<{ name: string; clipCount: number }>;
  clips?: Array<{ name: string; mediaPath: string; duration: number }>;
}

async function collectProjectState(): Promise<ProjectState> {
  try {
    const ppro = window.require('premierepro') as any;
    const project = await ppro.Project.getActiveProject();
    if (!project) return {};

    const sequence = await project.getActiveSequence();
    if (!sequence) return { sequenceName: '(no active sequence)' };

    const state: ProjectState = { sequenceName: sequence.name };

    // Audio tracks summary
    const audioCount = await sequence.getAudioTrackCount();
    state.audioTracks = [];
    for (let i = 0; i < audioCount; i++) {
      const track = await sequence.getAudioTrack(i);
      const items = track.getTrackItems(1, false);
      state.audioTracks.push({ name: track.name || `Audio ${i + 1}`, clipCount: items.length });
    }

    // Video tracks summary
    const videoCount = await sequence.getVideoTrackCount();
    state.videoTracks = [];
    for (let i = 0; i < videoCount; i++) {
      const track = await sequence.getVideoTrack(i);
      const items = track.getTrackItems(1, false);
      state.videoTracks.push({ name: track.name || `Video ${i + 1}`, clipCount: items.length });
    }

    // Clip details (first 50 to keep payload reasonable)
    state.clips = [];
    for (let i = 0; i < audioCount && state.clips!.length < 50; i++) {
      const track = await sequence.getAudioTrack(i);
      const items = track.getTrackItems(1, false);
      for (const item of items) {
        if (state.clips!.length >= 50) break;
        try {
          const name = await item.getName();
          const pi = await item.getProjectItem();
          const clip = ppro.ClipProjectItem.cast(pi);
          const mediaPath = await clip.getMediaFilePath();
          const start = await item.getStartTime();
          const end = await item.getEndTime();
          state.clips!.push({ name, mediaPath, duration: end.seconds - start.seconds });
        } catch { /* skip */ }
      }
    }

    return state;
  } catch (err) {
    return { sequenceName: `(collect failed: ${err instanceof Error ? err.message : String(err)})` };
  }
}

function collectSystemInfo(): Record<string, string> {
  const info: Record<string, string> = {
    pluginVersion: '1.0.0', // from manifest.json
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
  };

  try {
    const uxp = window.require('uxp') as any;
    info.uxpVersion = uxp.versions?.uxp ?? 'unknown';
    info.hostApp = uxp.host?.name ?? 'unknown';
    info.hostVersion = uxp.host?.version ?? 'unknown';
    info.os = uxp.os?.platform ?? navigator.platform ?? 'unknown';
  } catch { /* non-critical */ }

  return info;
}

/**
 * Capture and send a bug report to the backend.
 * Called automatically by setErrorStatus() on every error.
 * Silent — never throws, never blocks the UI.
 */
export async function captureErrorReport(feature: string, error: unknown): Promise<void> {
  // Debounce
  const now = Date.now();
  if (now - lastReportTime < DEBOUNCE_MS) return;
  lastReportTime = now;

  // Don't send if not authenticated
  if (!authService.get()) return;

  try {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const [projectState, systemInfo] = await Promise.all([
      collectProjectState(),
      Promise.resolve(collectSystemInfo()),
    ]);

    const payload = {
      feature,
      errorMessage,
      errorStack: errorStack ?? null,
      frontendLogs: getLogsAsText(),
      projectState,
      systemInfo,
      requestIds: getRecentRequestIds(),
    };

    // Fire-and-forget POST (don't use backendClient.request to avoid recursive errors)
    const apiKey = authService.get();
    if (!apiKey) return;

    const url = `${(import.meta.env.VITE_BACKEND_URL as string)}/bug-reports`;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-API-Key', apiKey);
    xhr.timeout = 10_000;
    xhr.send(JSON.stringify(payload));
    // No await, no callback — truly fire-and-forget
  } catch {
    // Silent — bug reporting must never cause a secondary error
  }
}
