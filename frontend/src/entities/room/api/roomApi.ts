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
  stageRole: ParticipantStageRole;
  connectionStatus: ParticipantConnectionStatus;
  host: boolean;
}

export interface RoomSnapshotResponse {
  name: string;
  mode: RoomMode;
  status: RoomStatus;
  hostUserId: number;
  maxParticipants: number;
  participants: RoomSnapshotParticipant[];
}

export interface RoomSessionResponse {
  roomId: number;
  participantId: number;
  inviteCode: string;
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
