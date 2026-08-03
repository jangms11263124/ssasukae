export interface SingAtParts {
  /** "07-22" */
  date: string;
  /** "02:59 PM" */
  time: string;
}

/**
 * 서버의 LocalDateTime("2026-07-22T14:59:27.965355")을 표기용으로 쪼갠다.
 * 마이크로초 6자리는 브라우저 파싱이 불안정해 3자리로 자르고,
 * 오프셋이 없으므로 로컬 시간으로 해석된다.
 */
export function formatSingAt(value: string | null | undefined): SingAtParts | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/(\.\d{3})\d+$/, '$1');
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');

  const hours24 = parsed.getHours();
  const meridiem = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = String(hours24 % 12 === 0 ? 12 : hours24 % 12).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');

  return {
    date: `${month}-${day}`,
    time: `${hours12}:${minutes} ${meridiem}`,
  };
}
