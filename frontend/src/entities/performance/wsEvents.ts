import type { LeaderboardEntry } from './types';

export type PerformanceStatus =
  | 'PREPARING'
  | 'PLAYING'
  | 'SUSPENDED'
  | 'ANALYZING'
  | 'ANALYSIS_FAILED'
  | 'FINISHED'
  | 'CANCELLED';

export type RoomStatus = 'PREPARING' | 'PLAYING';

export interface PerformanceSettings {
  keyOffset: number;
  tempoPercent: number;
  mrVolumePercent: number;
  micVolumePercent: number;
  echoLevel: number;
  reverbLevel: number;
}

export const DEFAULT_PERFORMANCE_SETTINGS: PerformanceSettings = {
  keyOffset: 0,
  tempoPercent: 100,
  mrVolumePercent: 100,
  micVolumePercent: 100,
  echoLevel: 0,
  reverbLevel: 0,
};

// ── 이벤트 payload ──────────────────────────────────────────

export interface PerformanceStartedPayload {
  performanceId: number;
  performerParticipantId: number;
  songId: number;
  performanceStatus: PerformanceStatus;
  roomStatus: RoomStatus;
}

export interface PerformancePreparationStartedPayload {
  performanceId: number;
  performerParticipantId: number;
  songId: number;
  songTitle: string;
  difficultyLevel: number | null;
  thumbnailImageUrl: string | null;
  mrDownloadUrl: string;
  midiJsonDownloadUrl: string;
  lyricsDownloadUrl: string;
}

export interface PlaybackStartedPayload {
  performanceId: number;
  performerParticipantId: number;
  startedAt: string;
}

export interface PlaybackFinishedPayload {
  performanceId: number;
  performerParticipantId: number;
  finishedAt: string;
}

export interface PerformanceSettingsChangedPayload {
  changedByParticipantId: number;
  settings: PerformanceSettings;
}

export interface PerformanceCancelledPayload {
  performanceId: number;
  performerParticipantId: number;
  previousPerformanceStatus: PerformanceStatus;
  performanceStatus: PerformanceStatus;
  roomStatus: RoomStatus;
  cancelReason: 'PERFORMER_REQUEST' | 'PERFORMER_DISCONNECTED' | 'SAFETY_TERMINATION';
}

export interface PerformanceStateChangedPayload {
  performanceId: number;
  previousStatus: PerformanceStatus;
  currentStatus: PerformanceStatus;
}

export interface LeaderboardUpdatedPayload {
  updatedPerformanceId: number;
  updatedFinalScore: number;
  items: LeaderboardEntry[];
}

export interface PerformanceSuspendedPayload {
  performanceId: number;
  performerParticipantId: number;
  previousStatus: PerformanceStatus;
  currentStatus: PerformanceStatus;
  suspendedAt: string;
  playbackPositionMs: number;
}

/** settings는 서버가 관리하는 4개 필드만 온다 — 기존 설정에 병합해야 한다 */
export interface PerformanceResumedPayload {
  performanceId: number;
  performerParticipantId: number;
  previousStatus: PerformanceStatus;
  currentStatus: PerformanceStatus;
  resumeAt: string;
  resumePositionMs: number;
  settings: Pick<
    PerformanceSettings,
    'keyOffset' | 'tempoPercent' | 'mrVolumePercent' | 'echoLevel'
  >;
}
