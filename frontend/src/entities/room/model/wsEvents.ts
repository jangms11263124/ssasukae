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

/** /user/queue/pong 으로 오는 PING 응답 payload — 백엔드 PongPayload 레코드와 1:1 */
export interface PongPayload {
  clientSentAt: string;
  serverReceivedAt: string;
}

// ── Room 이벤트 payload ──────────────────────────────────────

export interface ParticipantJoinedPayload {
  participantId: number;
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
}

export interface ParticipantLeftPayload {
  participantId: number;
}

export interface ParticipantKickedPayload {
  participantId: number;
}

export interface PerformerSelectedPayload {
  performerId: number;
}

/** 새 방장의 participantId만 온다 */
export interface RoomHostChangedPayload {
  participantId: number;
}

export interface RoomParticipantChatPayload {
  participantId: number;
  message: string;
  sendAt: string;
}

export interface RoomTerminatedPayload {
  terminatedAt: string;
}

export interface ParticipantConnectionStatusChangedPayload {
  participantId: number;
  /**
   * 서버 WS 이벤트는 스냅샷 API와 다른 enum(ParticipantStatus)을 써서
   * 재접속 시 CONNECTED 대신 ONLINE이 온다. 스토어 반영 전에 CONNECTED로 정규화한다.
   */
  status: ParticipantConnectionStatus | 'ONLINE';
}
