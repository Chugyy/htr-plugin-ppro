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
  baseURL: "http://localhost:5001",
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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    console.log(`[BackendClient] ${method} ${url}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(`HTTP ${response.status}: ${error.detail || "Request failed"}`);
      }

      const data = await response.json();
      console.log(`[BackendClient] Response:`, data);
      return data;
    } catch (error) {
      console.error(`[BackendClient] Request failed: ${method} ${url}`, error);
      throw error;
    }
  }

  /**
   * Generate transcription from audio clips
   */
  async generateTranscription(clips: AudioClipInfo[]): Promise<TranscriptionResponse> {
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
          timeline_end: clip.timelineEnd
        }))
      },
      timeout: 300000 // 5 minutes
    });
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
   * Optimize audio tracks with filters
   */
  async optimizeAudio(
    tracks: Array<{
      trackIndex: number;
      filterType: 'voice' | 'music' | 'sound_effects';
      clips: AudioClipInfo[];
    }>
  ): Promise<OptimizationResponse> {
    return this.request({
      method: "POST",
      endpoint: "/audio/optimization",
      body: { tracks },
      timeout: 300000  // 5 minutes
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
