import type { ParticipantConnectionStatus } from '@/entities/participant';

/** 서버가 발행하는 모든 WebSocket 이벤트의 공통 형식 */
export interface RoomWebSocketEvent<T = unknown> {
  eventType: string;
  roomId: number | null;
  occurredAt: string;
  payload: T;
}

/** /user/queue/errors 로 오는 에러 응답 */
export interface WebSocketErrorEvent {
  eventType: 'ERROR';
  occurredAt: string;
  payload: {
    errorCode: string;
    message: string;
    details?: unknown;
  };
}

/** /user/queue/pong 으로 오는 PING 응답 payload */
export interface PongPayload {
  requestId: string;
  roomId: number;
  clientSentAt: string;
  serverReceivedAt: string;
}

// ── Room 이벤트 payload ──────────────────────────────────────

export interface ParticipantJoinedPayload {
  participantId: number;
  userId: number;
  nickname: string;
  role: string;
  participantCount: number;
}

export interface ParticipantLeftPayload {
  participantId: number;
  nickname: string;
  participantCount: number;
}

export interface ParticipantKickedPayload {
  participantId: number;
  nickname: string;
  participantCount: number;
}

export interface PerformerSelectedPayload {
  performerId: number;
}

export interface RoomHostChangedPayload {
  previousHostParticipantId: number;
  newHostParticipantId: number;
}

export interface ParticipantConnectionStatusChangedPayload {
  participantId: number;
  status: ParticipantConnectionStatus;
}
