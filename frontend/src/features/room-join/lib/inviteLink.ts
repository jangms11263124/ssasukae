import { sanitizeInviteCode } from './inviteCodeInput';

/** 로비 입장 폼으로 바로 연결되는 초대 URL */
export function buildInviteLink(inviteCode: string): string {
  const code = sanitizeInviteCode(inviteCode);
  const path = `/lobby?invite=${encodeURIComponent(code)}`;

  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }

  return path;
}

/** URL 쿼리에서 초대 코드를 추출한다. */
export function readInviteCodeFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  const raw = params.get('invite') ?? params.get('code') ?? '';
  return sanitizeInviteCode(raw);
}
