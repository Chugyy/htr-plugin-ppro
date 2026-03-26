/**
 * API Types - Backend and Premiere Pro responses
 * Consolidated from v2 common.types.ts, audio.types.ts, transcript.types.ts
 */

// ========================================
// COMMON TYPES
// ========================================

export type LogType = 'success' | 'error' | 'warning' | 'info' | 'default';

export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type BackendStatus = 'unknown' | 'connected' | 'offline';

// ========================================
// AUDIO TYPES
// ========================================

export interface AudioClipInfo {
  // Identification
  clipName: string;
  trackIndex: number;

  // Source file
  sourceFilePath: string;

  // Portion of source media used (in seconds)
  sourceInPoint: number;   // Start in source file
  sourceOutPoint: number;  // End in source file
  sourceDuration: number;  // Duration to transcribe

  // Position in timeline (for reference, in seconds)
  timelineStart: number;   // Position in sequence
  timelineEnd: number;
  timelineDuration: number;
}

export interface AudioTrackInfo {
  trackIndex: number;
  trackName: string;
  isMuted: boolean;
  clipCount: number;
  clips: AudioClipInfo[];
}

// ========================================
// TRANSCRIPT TYPES
// ========================================

export interface TranscriptSegment {
  start: number;
  duration: number;
  language: string;
  speaker: string;
  words: TranscriptWord[];
}

export interface TranscriptWord {
  text: string;
  start: number;
  duration: number;
  confidence: number;
  eos: boolean;
  tags: string[];
  type: "word" | "punctuation";
}

export interface Speaker {
  id?: string;
  name?: string;
}

export interface PremiereTranscriptJSON {
  language: string;
  segments: TranscriptSegment[];
  speakers: Speaker[];
}

export interface ClipWithTranscript {
  clipName: string;
  clipProjectItem: any; // ClipProjectItem from Premiere Pro API
  hasTranscript: boolean;
  isSequence?: boolean;
}

// ========================================
// VIDEO / COLOR TYPES
// ========================================

export interface VideoClipInfo {
  clipName: string;
  trackIndex: number;
  sourceFilePath: string;
  timelineStart: number;
  timelineEnd: number;
  timelineDuration: number;
}

export interface VideoTrackInfo {
  trackIndex: number;
  trackName: string;
  clipCount: number;
  clips: VideoClipInfo[];
}

export interface LumetriCorrections {
  temperature: number;
  tint: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  saturation: number;
  vibrance: number;
}

export interface ColorDiagnostics {
  luminanceMean: number;
  luminanceStd: number;
  aShift: number;
  bShift: number;
  saturationMean: number;
  clippedHighlightsPct: number;
  crushedShadowsPct: number;
}

export interface ColorAnalysisResponse {
  diagnostics: ColorDiagnostics;
  corrections: LumetriCorrections;
}

// ========================================
// BACKEND API RESPONSES
// ========================================

export interface TranscriptionResponse {
  transcriptionJson: PremiereTranscriptJSON;
  text: string;
  duration: number;
  wordCount: number;
}

export interface CorrectionResponse {
  correctedJson: PremiereTranscriptJSON;
  correctionsApplied: boolean;
  modelUsed: string;
  errorsDetected: { grammar: number; spelling: number; total: number };
}

export interface OptimizationResponse {
  success: boolean;
  optimizedTracks?: Array<{
    trackIndex: number;
    filterType: string;
    clips: Array<{
      clipName: string;
      optimizedPath: string;
      duration: number;
      timelineStart: number;
      timelineEnd: number;
    }>;
  }>;
  processingTime?: number;
  outputDirectory?: string;
  error?: string;
}
