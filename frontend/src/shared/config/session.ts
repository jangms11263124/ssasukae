export const SESSION_KICKED_MESSAGE =
  '다른 기기에서 로그인되어 세션이 만료되었습니다.';

export function isSessionKickedMessage(message: string | null | undefined): boolean {
  return message === SESSION_KICKED_MESSAGE;
}
