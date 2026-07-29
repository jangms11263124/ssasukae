export const INVITE_CODE_LENGTH = 6;

/** 대문자·숫자만 남기고 최대 길이로 자른다. */
export function sanitizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, INVITE_CODE_LENGTH);
}

/**
 * 물리 키 위치(KeyboardEvent.code) 기준으로 초대 코드 문자를 구한다.
 * 한글 IME 상태에서도 KeyA~KeyZ, Digit0~9, Numpad0~9는 그대로 유지되므로
 * ㅁㄴㅇㄹ 대신 ASDF가 입력된다. 대상이 아니면 null을 반환한다.
 */
export function mapKeyCodeToInviteChar(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    return letter[1];
  }

  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) {
    return digit[1];
  }

  return null;
}
