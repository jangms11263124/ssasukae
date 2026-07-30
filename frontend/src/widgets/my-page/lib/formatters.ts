const MONTH_LABELS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/**
 * 서버의 LocalDateTime("2026-07-22T14:59:27.965355")을 Date로 파싱한다.
 * 마이크로초 6자리는 브라우저 파싱이 불안정해 3자리로 자르고,
 * 오프셋이 없으므로 로컬 시간으로 해석된다.
 */
function parseServerDateTime(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/(\.\d{3})\d+$/, '$1');
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "OCT_2023" — 가입 시점 표기 */
export function formatMemberSince(value: string | null | undefined): string {
  const date = parseServerDateTime(value);

  if (!date) {
    return '--';
  }

  return `${MONTH_LABELS[date.getMonth()]}_${date.getFullYear()}`;
}

/** "24 OCT · 14:32" — 최근 공연 일시 표기 */
export function formatPerformedAt(value: string | null | undefined): string | null {
  const date = parseServerDateTime(value);

  if (!date) {
    return null;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day} ${MONTH_LABELS[date.getMonth()]} · ${hours}:${minutes}`;
}

/** "07.23 16:24" — 통계 갱신 시각 표기 */
export function formatUpdatedAt(value: string | null | undefined): string {
  const date = parseServerDateTime(value);

  if (!date) {
    return '--';
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${month}.${day} ${hours}:${minutes}`;
}

/**
 * "alexanders@gmail.com" → "AL****S@GMAIL.COM"
 * 로컬 파트의 앞 두 글자와 마지막 한 글자만 남긴다.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) {
    return '--';
  }

  const atIndex = email.lastIndexOf('@');

  if (atIndex <= 0) {
    return email.toUpperCase();
  }

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex);

  // 너무 짧으면 가릴 여지가 없으므로 전체를 마스킹한다.
  if (localPart.length <= 3) {
    return `${'*'.repeat(localPart.length)}${domain}`.toUpperCase();
  }

  const head = localPart.slice(0, 2);
  const tail = localPart.slice(-1);

  return `${head}****${tail}${domain}`.toUpperCase();
}

/** 1248 → "1,248" */
export function formatCount(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString('en-US') : '--';
}

/**
 * 이미지로 쓸 수 있는 값(http(s) URL)만 통과시키고, 아니면 null을 돌려 플레이스홀더를 띄운다.
 * 서버가 presigned URL 대신 S3 오브젝트 키를 내려주던 사고가 있어 방어로 남겨 둔다.
 */
export function toImageSrc(thumbnailUrl: string | null | undefined): string | null {
  if (!thumbnailUrl) {
    return null;
  }

  return /^https?:\/\//.test(thumbnailUrl) ? thumbnailUrl : null;
}
