/**
 * 백엔드 SESSION_EXPIRED 원문. 응답에 code가 없을 때 메시지로 판별하기 위한 값이라
 * 사용자에게 그대로 보여주지 않는다 (표시 문구는 FRONTEND_ERROR_MESSAGES가 갖는다).
 */
export const SESSION_KICKED_SERVER_MESSAGE =
  '다른 기기에서 로그인되어 세션이 만료되었습니다.';

export function isSessionKickedMessage(message: string | null | undefined): boolean {
  return message === SESSION_KICKED_SERVER_MESSAGE;
}
