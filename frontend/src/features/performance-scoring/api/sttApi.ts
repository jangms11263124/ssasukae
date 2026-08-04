import { AI_BASE_URL } from '@/shared/config/env';

/**
 * 오디오 조각 하나를 STT에 보내고 인식된 텍스트를 받는다.
 * shared/api/client 대신 fetch를 직접 쓴다 — AI 서버는 Spring BFF가 아니라 다른 origin이고
 * 인증·토큰 재발급 흐름을 타지 않는다.
 */
export async function requestStt(audio: Blob, fileName: string): Promise<string> {
  const body = new FormData();
  body.append('audio', audio, fileName);

  // Content-Type을 직접 넣으면 boundary가 빠져 422가 난다. 브라우저가 정하게 둔다.
  const response = await fetch(`${AI_BASE_URL}/api/v1/stt`, { method: 'POST', body });

  if (!response.ok) {
    throw new Error(`STT 요청 실패 (${response.status})`);
  }

  const data = (await response.json()) as { transcript?: string };

  return data.transcript ?? '';
}
