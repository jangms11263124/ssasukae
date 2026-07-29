export const OAUTH_GOOGLE_URL = '/oauth2/authorization/google';

export const OAUTH_KAKAO_URL = '/oauth2/authorization/kakao';

// STOMP WebSocket은 Next 라우트 핸들러(프록시)로 업그레이드가 불가능해
// 백엔드 origin에 직접 연결한다.
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';
