export const OAUTH_GOOGLE_URL = '/oauth2/authorization/google';

export const OAUTH_KAKAO_URL = '/oauth2/authorization/kakao';

// STOMP WebSocket은 Next 라우트 핸들러(프록시)로 업그레이드가 불가능해
// 백엔드 origin에 직접 연결한다.
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';

// AI 서버(STT·채점) origin. Spring BFF와 달리 Next 라우트 핸들러를 거치지 않고 직접 부른다 —
// 30초마다 나가는 오디오 청크를 프록시로 한 번 더 통과시킬 이유가 없다.
// AI 서버 CORS_ORIGINS에 프론트 주소가 들어 있어야 한다.
export const AI_BASE_URL = process.env.NEXT_PUBLIC_AI_BASE_URL ?? 'http://localhost:8000';
