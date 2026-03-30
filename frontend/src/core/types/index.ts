/**
 * Types Index - Re-export all types
 */

// API Types
export type {
  LogType,
  Result,
  BackendStatus,
  AudioClipInfo,
  AudioTrackInfo,
  TranscriptSegment,
  TranscriptWord,
  Speaker,
  PremiereTranscriptJSON,
  ClipWithTranscript,
  TranscriptionResponse,
  CorrectionResponse,
  OptimizationResponse,
  VideoClipInfo,
  VideoTrackInfo,
  LumetriCorrections,
  ColorDiagnostics,
  LogDetection,
  ColorAnalysisResponse
} from './api.types';

export type { LogProfile } from './api.types';
export { LOG_PROFILE_LABELS } from './api.types';

// Premiere Pro Types
export type {
  Time,
  Project,
  Sequence,
  Selection,
  VideoTrack,
  AudioTrack,
  TrackItem,
  VideoClipTrackItem,
  AudioClipTrackItem,
  ComponentChain,
  ProjectItem,
  ClipProjectItem,
  CompoundAction,
  TranscriptAPI,
  Constants,
  PremiereProAPI
} from './premierepro.d';
