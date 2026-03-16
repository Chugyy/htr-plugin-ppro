/**
 * Backend API Client
 * Copied from v2 with config integrated
 */

import type {
  AudioClipInfo,
  PremiereTranscriptJSON,
  TranscriptionResponse,
  CorrectionResponse,
  OptimizationResponse
} from '@/core/types';
import { authService } from '@/core/services/authService';

// ========================================
// CONFIGURATION
// ========================================

const BACKEND_CONFIG = {
  baseURL: import.meta.env.VITE_BACKEND_URL as string,
  timeout: 30000, // 30 seconds
};

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

    console.log(`[BackendClient] ${method} ${url}`);

    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
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
            const error = JSON.parse(xhr.responseText);
            reject(new Error(`HTTP ${xhr.status}: ${error.detail || 'Request failed'}`));
          } catch {
            reject(new Error(`HTTP ${xhr.status}: Request failed`));
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
    console.log(`[BackendClient] POST ${url} (${filename})`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000); // 2 min

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
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
    console.log(`[BackendClient] GET ${url}`);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
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
