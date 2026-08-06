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
  /** 목소리 울림 양. 이름은 서버 계약을 따르지만 구현은 리버브다 */
  echoLevel: number;
  /** 가창자 모니터에서 들리는 자기 목소리 크기. 로컬 전용 — 서버 계약(4필드)에 없음 */
  monitorVoicePercent: number;
}

export const DEFAULT_PERFORMANCE_SETTINGS: PerformanceSettings = {
  keyOffset: 0,
  tempoPercent: 100,
  mrVolumePercent: 100,
  micVolumePercent: 100,
  // 조절 없이 시작해도 목소리에 기본 울림이 걸리도록 한다. 백엔드 defaults()와 값을 맞춰야
  // 재개 시 서버 기본값이 내려와도 어긋나지 않는다.
  echoLevel: 30,
  monitorVoicePercent: 30,
};

/**
 * 가창자 연결이 끊긴 뒤 서버가 기다려 주는 재접속 유예(초). 만료되면 서버가 해당 참가자를
 * 방에서 내보내고 공연을 취소한다. 마감 시각은 따로 내려오지 않아 FE가 연결이 끊긴 시각에
 * 이 값을 더해 계산하므로, 백엔드 performance.recovery.performer-disconnect-grace와 맞춰야 한다.
 */
export const PERFORMER_RECONNECT_GRACE_SECONDS = 15;

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
