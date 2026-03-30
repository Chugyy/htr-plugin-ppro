/**
 * Backend API Client
 * Copied from v2 with config integrated
 */

import type {
  AudioClipInfo,
  PremiereTranscriptJSON,
  TranscriptionResponse,
  CorrectionResponse,
  OptimizationResponse,
  ColorAnalysisResponse
} from '@/core/types';
import { authService } from '@/core/services/authService';

// ========================================
// CONFIGURATION
// ========================================

const BACKEND_CONFIG = {
  baseURL: import.meta.env.VITE_BACKEND_URL as string,
  timeout: 30000, // 30 seconds
};

const DASHBOARD_URL = (import.meta.env.VITE_DASHBOARD_URL as string) || 'https://plugin.hittherecord.com';

// ========================================
// REQUEST ID TRACKING
// ========================================

const MAX_RECENT_IDS = 20;
const recentRequestIds: string[] = [];

function trackRequestId(): string {
  const id = crypto.randomUUID();
  recentRequestIds.push(id);
  if (recentRequestIds.length > MAX_RECENT_IDS) recentRequestIds.shift();
  return id;
}

/** Returns the last N request IDs for bug report correlation. */
export function getRecentRequestIds(): string[] {
  return [...recentRequestIds];
}

/** Open a URL in the user's default browser (UXP shell) */
export function openInBrowser(url: string): void {
  try {
    const { shell } = window.require("uxp") as any;
    shell.openExternal(url);
  } catch {
    console.warn('[BackendClient] Could not open browser:', url);
  }
}

/** Error with optional action link for the UI to render a button */
export class BackendError extends Error {
  code: string | null;
  actionUrl: string | null;
  actionLabel: string | null;

  constructor(message: string, code?: string | null, actionUrl?: string | null, actionLabel?: string | null) {
    super(message);
    this.code = code ?? null;
    this.actionUrl = actionUrl ?? null;
    this.actionLabel = actionLabel ?? null;
  }
}

// ========================================
// HTTP CLIENT
// ========================================

interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  endpoint: string;
  body?: any;
  timeout?: number;
}

export class BackendClient {
  private baseURL: string;
  private timeout: number;

  constructor() {
    this.baseURL = BACKEND_CONFIG.baseURL;
    this.timeout = BACKEND_CONFIG.timeout;
  }

  /**
   * Generic HTTP request with API key authentication
   */
  async request<T>(options: RequestOptions): Promise<T> {
    const { method, endpoint, body, timeout = this.timeout } = options;
    const url = `${this.baseURL}${endpoint}`;

    const apiKey = authService.get();
    if (!apiKey) throw new Error("Not authenticated");

    const requestId = trackRequestId();
    console.log(`[BackendClient] ${method} ${url} [rid:${requestId}]`);

    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('X-API-Key', apiKey);
      xhr.setRequestHeader('X-Request-Id', requestId);
      xhr.timeout = timeout;

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            console.log(`[BackendClient] Response:`, data);
            resolve(data);
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          try {
            const body = JSON.parse(xhr.responseText);
            // detail can be a string or a structured object {error, code, ...}
            const detail = body.detail;
            const code = typeof detail === 'object' ? detail?.code : null;
            const message = typeof detail === 'object' ? detail?.error : (typeof detail === 'string' ? detail : 'Request failed');

            // Auto-disconnect on invalid key or no subscription
            if (code === 'INVALID_KEY' || code === 'NO_SUBSCRIPTION') {
              authService.clear();
              window.location.reload();
              return;
            }

            // Build a human-readable error with action link (no auto-redirect)
            if (code === 'LIMIT_REACHED' && detail?.used !== undefined) {
              reject(new BackendError(
                `Limite atteinte : ${detail.used}/${detail.limit} ${detail.feature || ''} ce mois.`,
                code,
                `${DASHBOARD_URL}/register/plan`,
                'Upgrade mon plan',
              ));
              return;
            }
            if (code === 'PAYMENT_FAILED') {
              reject(new BackendError(
                'Paiement échoué — mets à jour ta carte.',
                code,
                `${DASHBOARD_URL}/dashboard/billing`,
                'Gérer mon abonnement',
              ));
              return;
            }

            reject(new BackendError(message, code));
          } catch {
            reject(new Error(`Erreur HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        console.error(`[BackendClient] Request failed: ${method} ${url}`);
        reject(new Error('Network error'));
      };

      xhr.ontimeout = () => {
        console.error(`[BackendClient] Request timeout: ${method} ${url}`);
        reject(new Error('Request timeout'));
      };

      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  /**
   * Upload a pre-extracted local audio file to the backend.
   * Returns the server-side path for use in generateTranscription().
   */
  async uploadAudio(localPath: string): Promise<string> {
    const { storage } = window.require("uxp") as any;

    const apiKey = authService.get();
    if (!apiKey) throw new Error("Not authenticated");

    const entry = await storage.localFileSystem.getEntryWithUrl(localPath);
    const buffer: ArrayBuffer = await entry.read({ format: storage.formats.binary });

    const filename = localPath.split("/").pop() || "audio.wav";
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: "audio/wav" }), filename);

    const url = `${this.baseURL}/audio/upload`;
    const requestId = trackRequestId();
    console.log(`[BackendClient] POST ${url} (${filename}) [rid:${requestId}]`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000); // 2 min

    const res = await fetch(url, {
      method: "POST",
      headers: { 'X-API-Key': apiKey, 'X-Request-Id': requestId },
      body: formData,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Upload failed: ${(err as any).detail || res.statusText}`);
    }

    const data = await res.json() as { server_path: string };
    console.log(`[BackendClient] Uploaded → ${data.server_path}`);
    return data.server_path;
  }

  /**
   * Generate transcription from audio clips.
   * Pass preextracted=true when clips have been exported via AME and uploaded —
   * the backend will skip ffmpeg extraction and use the files directly.
   */
  async generateTranscription(
    clips: AudioClipInfo[],
    preextracted = false,
    speaker?: { id: string; name: string },
  ): Promise<TranscriptionResponse> {
    return this.request({
      method: "POST",
      endpoint: "/audio/transcription",
      body: {
        clips: clips.map(clip => ({
          clip_name: clip.clipName,
          source_file_path: clip.sourceFilePath,
          source_in_point: clip.sourceInPoint,
          source_out_point: clip.sourceOutPoint,
          timeline_start: clip.timelineStart,
          timeline_end: clip.timelineEnd,
          preextracted,
        })),
        ...(speaker && { speaker_id: speaker.id, speaker_name: speaker.name }),
      },
      timeout: 300000 // 5 minutes
    });
  }

  /**
   * Download an optimized file from the backend to the UXP data folder.
   * Returns the local native path for use with project.importFiles().
   */
  async downloadOptimizedFile(serverPath: string, outputDir: string): Promise<string> {
    const uxp = window.require("uxp") as any;
    const apiKey = authService.get();
    if (!apiKey) throw new Error("Not authenticated");

    const filename = serverPath.split("/").pop()!;
    const url = `${this.baseURL}/audio/download?path=${encodeURIComponent(serverPath)}`;
    const requestId = trackRequestId();
    console.log(`[BackendClient] GET ${url} [rid:${requestId}]`);

    const res = await fetch(url, { headers: { 'X-API-Key': apiKey, 'X-Request-Id': requestId } });
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);

    const buffer = await res.arrayBuffer();

    // Write to user-specified output directory
    const folderEntry = await uxp.storage.localFileSystem.getEntryWithUrl(outputDir);
    const entry = await folderEntry.createFile(filename, { overwrite: true });
    await entry.write(buffer, { format: uxp.storage.formats.binary });

    console.log(`[BackendClient] Downloaded → ${entry.nativePath}`);
    return entry.nativePath as string;
  }

  /**
   * Correct transcription using Grammalecte
   */
  async correctTranscription(transcriptionJson: PremiereTranscriptJSON): Promise<CorrectionResponse> {
    return this.request({
      method: "POST",
      endpoint: "/audio/correction",
      body: {
        transcription_json: transcriptionJson
      },
      timeout: 60000 // 1 minute
    });
  }

  /**
   * Optimize audio tracks with filters.
   * Timeout scales with total audio duration: max(60s, totalDuration × 1.5).
   */
  async optimizeAudio(
    tracks: Array<{
      trackIndex: number;
      filterType: 'voice' | 'music' | 'sound_effects';
      clips: AudioClipInfo[];
    }>,
    totalDurationSeconds: number = 300
  ): Promise<OptimizationResponse> {
    const timeout = Math.max(60_000, totalDurationSeconds * 1_500);
    return this.request({
      method: "POST",
      endpoint: "/audio/optimization",
      body: {
        tracks: tracks.map(track => ({
          ...track,
          clips: track.clips.map(clip => ({
            clip_name: clip.clipName,
            source_file_path: clip.sourceFilePath,
            source_in_point: clip.sourceInPoint,
            source_out_point: clip.sourceOutPoint,
            timeline_start: clip.timelineStart,
            timeline_end: clip.timelineEnd,
            preextracted: true,
          })),
        })),
      },
      timeout,
    });
  }

  /**
   * Detect silences in an uploaded audio file using ffmpeg.
   */
  async detectSilences(
    audioPath: string,
    options?: { noiseThreshold?: number; minDuration?: number; timelineOffset?: number },
  ): Promise<{ silences: Array<{ start: number; end: number; duration: number }>; totalSilenceDuration: number; audioDuration: number }> {
    return this.request({
      method: "POST",
      endpoint: "/audio/silence-detect",
      body: {
        audio_path: audioPath,
        noise_threshold: options?.noiseThreshold ?? -30,
        min_duration: options?.minDuration ?? 0.5,
        timeline_offset: options?.timelineOffset ?? 0,
      },
      timeout: 60000,
    });
  }

  /**
   * Upload a frame image for color analysis.
   * Returns the server-side path.
   */
  async uploadFrame(buffer: ArrayBuffer, filename: string, logProfile: string = 'auto'): Promise<string> {
    const apiKey = authService.get();
    if (!apiKey) throw new Error("Not authenticated");

    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: "image/png" }), filename);

    const url = `${this.baseURL}/color/analyze?log_profile=${encodeURIComponent(logProfile)}`;
    const requestId = trackRequestId();
    console.log(`[BackendClient] POST ${url} (${filename}) [rid:${requestId}]`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(url, {
      method: "POST",
      headers: { 'X-API-Key': apiKey, 'X-Request-Id': requestId },
      body: formData,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = (err as any).detail;
      const code = typeof detail === 'object' ? detail?.code : null;
      const message = typeof detail === 'object' ? detail?.error : (typeof detail === 'string' ? detail : `HTTP ${res.status}`);

      if (code === 'INVALID_KEY' || code === 'NO_SUBSCRIPTION') {
        authService.clear();
        window.location.reload();
        throw new Error(message);
      }
      if (code === 'LIMIT_REACHED') {
        throw new BackendError(
          `Limite atteinte : ${detail.used}/${detail.limit} corrections couleur ce mois.`,
          code,
          `${DASHBOARD_URL}/register/plan`,
          'Upgrade mon plan',
        );
      }
      throw new BackendError(message, code);
    }

    const data = await res.json() as ColorAnalysisResponse;
    console.log(`[BackendClient] Color analysis:`, data.corrections);
    return data as any;
  }

  /**
   * Analyze a frame for color correction.
   * Uploads the frame and returns Lumetri corrections in one call.
   */
  async analyzeFrame(buffer: ArrayBuffer, filename: string, logProfile: string = 'auto'): Promise<ColorAnalysisResponse> {
    return this.uploadFrame(buffer, filename, logProfile) as unknown as ColorAnalysisResponse;
  }

  /**
   * Health check
   */
  async checkHealth(): Promise<{ status: string }> {
    return this.request({
      method: "GET",
      endpoint: "/health",
    });
  }
}

// ========================================
// SINGLETON INSTANCE
// ========================================

export const backendClient = new BackendClient();
