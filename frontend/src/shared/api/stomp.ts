import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';

import { WS_URL } from '@/shared/config/env';
import { getAccessToken } from '@/shared/model/authStore';

import { refreshStoredAccessToken } from './client';

const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60_000;

function tokenNeedsRefresh(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return true;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(normalized)) as { exp?: number };
    return !claims.exp || claims.exp * 1_000 <= Date.now() + ACCESS_TOKEN_REFRESH_MARGIN_MS;
  } catch {
    return true;
  }
}

export interface StompConnectionCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  /** STOMP ERROR 프레임(인증 실패 등) 수신 시 호출 */
  onStompError?: (message: string) => void;
}

/**
 * 백엔드 STOMP 규약(raw WebSocket `/ws`, CONNECT 프레임 Authorization 헤더,
 * 하트비트 10초)에 맞춘 클라이언트를 생성한다.
 *
 * 토큰은 연결(재연결) 시점마다 authStore에서 다시 읽어 부착한다.
 */
export function createStompClient(callbacks: StompConnectionCallbacks = {}): Client {
  const client = new Client({
    brokerURL: WS_URL,
    heartbeatIncoming: 10_000,
    heartbeatOutgoing: 10_000,
    reconnectDelay: 3_000,
    beforeConnect: async () => {
      let accessToken = getAccessToken();
      if (accessToken && tokenNeedsRefresh(accessToken)) {
        try {
          accessToken = await refreshStoredAccessToken();
        } catch {
          // refresh 실패는 공통 인증 처리에서 메모리 토큰을 제거한다. 여기서 오류를
          // 다시 전파하면 STOMP 내부 Promise가 unhandledRejection으로 노출된다.
          accessToken = null;
        }
      }
      client.connectHeaders = accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {};
    },
    onConnect: () => callbacks.onConnect?.(),
    onWebSocketClose: () => callbacks.onDisconnect?.(),
    onStompError: (frame) => {
      callbacks.onStompError?.(frame.headers['message'] ?? 'STOMP 오류가 발생했습니다.');
    },
  });

  return client;
}

/** 구독 메시지 본문을 JSON으로 파싱해 핸들러에 넘기는 헬퍼 */
export function subscribeJson<T>(
  client: Client,
  destination: string,
  handler: (body: T) => void,
): StompSubscription {
  return client.subscribe(destination, (message: IMessage) => {
    try {
      handler(JSON.parse(message.body) as T);
    } catch {
      // 파싱 불가 메시지는 무시한다.
    }
  });
}
