/**
 * Premiere Pro UXP API Type Definitions
 * Adapted from v2 types for v3 architecture
 */

export interface Time {
  seconds: number;
  ticks: string;
}

export interface Project {
  name: string;
  path: string;
  sequences: Sequence[];
  getActiveSequence(): Promise<Sequence>;
  getRootItem(): Promise<FolderItem>;
  lockedAccess(callback: () => void): void;
  executeTransaction(callback: (compoundAction: CompoundAction) => void, undoLabel?: string): boolean;
}

export interface Sequence {
  name: string;
  videoTracks: VideoTrack[];
  audioTracks: AudioTrack[];
  getVideoTrackCount(): Promise<number>;
  getAudioTrackCount(): Promise<number>;
  getVideoTrack(index: number): Promise<VideoTrack>;
  getAudioTrack(index: number): Promise<AudioTrack>;
  getSelection(): Promise<Selection>;
  getProjectItem(): Promise<ProjectItem>;
}

export interface Selection {
  videoClipTrackItems: VideoClipTrackItem[];
  audioClipTrackItems: AudioClipTrackItem[];
}

export interface VideoTrack {
  name: string;
  clips: VideoClipTrackItem[];
  isMuted(): Promise<boolean>;
  getTrackItems(type: number, includePlaceholder: boolean): TrackItem[];
}

export interface AudioTrack {
  name: string;
  clips: AudioClipTrackItem[];
  isMuted(): Promise<boolean>;
  getTrackItems(type: number, includePlaceholder: boolean): TrackItem[];
}

export interface TrackItem {
  getName(): Promise<string>;
  getProjectItem(): Promise<ProjectItem>;
  getInPoint(): Promise<Time>;
  getOutPoint(): Promise<Time>;
  getStartTime(): Promise<Time>;
  getEndTime(): Promise<Time>;
}

export interface VideoClipTrackItem extends TrackItem {
  getVideoComponentChain(): Promise<ComponentChain>;
}

export interface AudioClipTrackItem extends TrackItem {
  getAudioComponentChain(): Promise<ComponentChain>;
}

export interface ComponentChain {
  createAppendComponentAction(component: any): any;
}

export interface ProjectItem {
  name: string;
  type: number;
}

export interface FolderItem extends ProjectItem {
  getItems(): Promise<ProjectItem[]>;
}

export interface ClipProjectItem extends ProjectItem {
  getMediaFilePath(): Promise<string>;
  getContentType(): Promise<number>;
}

export interface CompoundAction {
  addAction(action: any): void;
}

export interface TranscriptAPI {
  importFromJSON(jsonString: string): any;
  exportToJSON(clipProjectItem: ClipProjectItem): Promise<string>;
  createImportTextSegmentsAction(textSegments: any, clipProjectItem: ClipProjectItem): any;
}

export interface Constants {
  TrackItemType: {
    CLIP: number;
    EMPTY: number;
  };
  ContentType: {
    AUDIO: number;
    VIDEO: number;
    SEQUENCE: number;
  };
}

export interface TickTime {
  seconds: number;
  ticks: string;
}

export interface SequenceEditor {
  createRemoveItemsAction(selection: TrackItemSelection, ripple: boolean, mediaType: any): any;
  createOverwriteItemAction(projectItem: any, time: TickTime, videoTrackIndex: number, audioTrackIndex: number): any;
  createInsertProjectItemAction(projectItem: any, time: TickTime, videoTrackIndex: number, audioTrackIndex: number, limitShift: boolean): any;
}

export interface TrackItemSelection {
  addItem(trackItem: any, skipDuplicateCheck?: boolean): boolean;
  removeItem(trackItem: any): boolean;
  getTrackItems(): Promise<any[]>;
}

export interface PremiereProAPI {
  Project: {
    getActiveProject(): Promise<Project>;
  };
  ClipProjectItem: {
    cast(projectItem: ProjectItem): ClipProjectItem;
  };
  FolderItem: {
    cast(projectItem: ProjectItem): FolderItem;
  };
  Time: {
    fromSeconds(seconds: number): Time;
  };
  TickTime: {
    createWithSeconds(seconds: number): TickTime;
    createWithTicks(ticks: string): TickTime;
    TIME_ZERO: TickTime;
  };
  SequenceEditor: {
    getEditor(sequence: Sequence): SequenceEditor;
  };
  TrackItemSelection: {
    createEmptySelection(callback: (selection: TrackItemSelection) => void): boolean;
  };
  Transcript: TranscriptAPI;
  Constants: Constants;
}

// Global window type extension
declare global {
  interface Window {
    require(module: "premierepro"): PremiereProAPI;
  }
}
