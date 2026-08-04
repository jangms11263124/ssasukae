import type { CardAssignmentStatus, CardEffectType } from '@/entities/card';
import type { PerformanceSettings, PerformanceStatus } from '@/entities/performance';
import type {
  ParticipantConnectionStatus,
  ParticipantStageRole,
} from '@/entities/participant';
import { apiClient } from '@/shared/api/client';

import type { RoomMode } from '../types';

export type RoomStatus = 'PREPARING' | 'PLAYING' | 'TERMINATED';

export interface RoomSnapshotParticipant {
  participantId: number;
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
  stageRole: ParticipantStageRole;
  connectionStatus: ParticipantConnectionStatus;
  host: boolean;
}

/** 수성전: 재접속한 나에게 배정되어 있던 카드 (이름/설명은 스냅샷에 없어 FE 폴백으로 그린다) */
export interface RoomSnapshotMyCard {
  performanceId: number;
  status: CardAssignmentStatus;
  cardId: number;
  cardCode: string;
  effectType: CardEffectType;
  effectValue: number | null;
  durationSeconds: number;
}

/** 수성전: 참가자별 카드 사용 상태 (무지개/회색 미니 카드 복원용) */
export interface RoomSnapshotCardUsageStatus {
  performanceId: number;
  participantId: number;
  status: CardAssignmentStatus;
  usedAt: string | null;
}

/**
 * 수성전: 현재 방에서 발동 대기(PENDING) 또는 적용 중(ACTIVE)인 카드.
 * 카드 이름/설명은 스냅샷에 없어 effectType 폴백으로 그린다.
 */
export interface RoomSnapshotActiveCard {
  performanceId: number;
  roomCardStatus: 'IDLE' | 'PENDING' | 'ACTIVE';
  sourceParticipantId: number;
  targetParticipantId: number;
  effectType: CardEffectType;
  effectValue: number | null;
  approvedAt: string | null;
  activateAt: string | null;
  startedAt: string | null;
  endsAt: string | null;
}

export interface RoomSnapshotPerformance {
  performanceId: number;
  status: PerformanceStatus;
  suspendedFromStatus: PerformanceStatus | null;
  performerParticipantId: number;
  songId: number;
  songTitle: string;
  artist: string;
  difficultyLevel: number | null;
  thumbnailImageUrl: string | null;
  settings: Pick<
    PerformanceSettings,
    'keyOffset' | 'tempoPercent' | 'mrVolumePercent' | 'echoLevel'
  >;
  preparedAt: string;
  startedAt: string | null;
  suspendedAt: string | null;
  playbackPositionMs: number;
  songDurationMs: number;
  mrDownloadUrl: string;
  midiJsonDownloadUrl: string;
  lyricsDownloadUrl: string;
}

export interface RoomSnapshotPlayback {
  performanceId: number;
  playbackStatus: 'PLAYING' | 'SUSPENDED' | 'ANALYZING';
  playbackStartedAt: string;
  playbackPositionMs: number;
  accumulatedPausedDurationMs: number;
  songDurationMs: number;
}

export interface RoomSnapshotResponse {
  name: string;
  mode: RoomMode;
  status: RoomStatus;
  hostUserId: number;
  maxParticipants: number;
  serverNow?: string;
  participants: RoomSnapshotParticipant[];
  performance: RoomSnapshotPerformance | null;
  playback: RoomSnapshotPlayback | null;
  myCard?: RoomSnapshotMyCard | null;
  cardUsageStatuses?: RoomSnapshotCardUsageStatus[];
  activeCard?: RoomSnapshotActiveCard | null;
}

export interface RoomSessionResponse {
  roomId: number;
  participantId: number;
  inviteCode: string;
  /** 백엔드 저지연 방 모드 API 반영 전에는 없을 수 있다. */
  mode?: RoomMode;
  openViduSessionId: string;
  openViduToken: string;
}

export interface RoomTokenResponse {
  roomId: number;
  // 백엔드 DTO 필드명이 소문자 v(openviduToken)다.
  openviduToken: string;
}

export interface CreateRoomRequest {
  name: string;
  mode: RoomMode;
}

/** 방 생성 (생성자가 방장이 된다) */
export function createRoom(request: CreateRoomRequest): Promise<RoomSessionResponse> {
  return apiClient<RoomSessionResponse>('/api/rooms', {
    method: 'POST',
    auth: true,
    body: request,
  });
}

/** 초대 코드로 방 입장 */
export function joinRoom(inviteCode: string): Promise<RoomSessionResponse> {
  return apiClient<RoomSessionResponse>(
    `/api/rooms/invite/${encodeURIComponent(inviteCode.toUpperCase())}/join`,
    { method: 'POST', auth: true },
  );
}

/** 현재 참가 중인 방의 상태와 활성 참가자 목록 조회 */
export function getRoomSnapshot(roomId: number): Promise<RoomSnapshotResponse> {
  return apiClient<RoomSnapshotResponse>(`/api/rooms/${roomId}`, { auth: true });
}

/** 가창자 지정 (방장 전용). 서버가 역할을 승격하고 PERFORMER_SELECTED 이벤트를 브로드캐스트한다 */
export function selectPerformer(roomId: number, participantId: number): Promise<void> {
  return apiClient<void>(`/api/rooms/${roomId}/performer`, {
    method: 'POST',
    auth: true,
    body: { participantId },
  });
}

/** OpenVidu 미디어 연결 토큰 재발급 */
export function reissueMediaToken(roomId: number): Promise<RoomTokenResponse> {
  return apiClient<RoomTokenResponse>(`/api/rooms/${roomId}/token`, {
    method: 'POST',
    auth: true,
  });
}

/** 방 종료 (방장 전용) */
export function terminateRoom(roomId: number): Promise<void> {
  return apiClient<void>(`/api/rooms/${roomId}`, {
    method: 'DELETE',
    auth: true,
  });
}

/** 방 나가기 (일반 참가자). 서버가 PARTICIPANT_LEFT 이벤트를 브로드캐스트한다 */
export function leaveRoom(roomId: number): Promise<void> {
  return apiClient<void>(`/api/rooms/${roomId}/leave`, {
    method: 'DELETE',
    auth: true,
  });
}
