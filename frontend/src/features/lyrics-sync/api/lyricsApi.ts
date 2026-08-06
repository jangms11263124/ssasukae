import type { LyricsLookupResponse } from '../model/types';

export interface LyricsLookupParams {
  title: string;
  /** 없으면 제목만으로 검색한다 — 동명이곡이 섞이므로 검증에 더 의존하게 된다 */
  artist?: string;
  /**
   * 후보 채택의 필수 조건. 이 길이와 맞지 않는 레코드는 다른 편곡으로 보고 버리므로
   * 값을 모르는 상태로는 조회하지 않는다 (라우트가 400을 낸다).
   */
  durationSeconds: number;
}

/**
 * 라우트 핸들러(/api/lrclib)를 거쳐 LRCLIB 후보를 받아온다.
 * 백엔드 BFF가 아니라 우리 서버의 외부 프록시라 apiClient 대신 fetch를 쓴다
 * (AI 서버·S3 다운로드와 같은 방식).
 */
export async function fetchLyricsCandidates(
  params: LyricsLookupParams,
  signal?: AbortSignal,
): Promise<LyricsLookupResponse> {
  const search = new URLSearchParams({
    title: params.title,
    duration: String(Math.round(params.durationSeconds)),
  });

  if (params.artist !== undefined && params.artist !== '') {
    search.set('artist', params.artist);
  }

  const response = await fetch(`/api/lrclib?${search.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`가사 타임스탬프를 불러오지 못했습니다 (${response.status})`);
  }

  return response.json() as Promise<LyricsLookupResponse>;
}

/**
 * 관리자가 올린 가사 .txt(타임스탬프 없는 원문)를 읽는다. LRCLIB 후보가 같은 곡인지
 * 대조하는 정답지로만 쓴다.
 *
 * 채점 쪽에도 같은 파일을 읽는 함수가 있지만 재사용하지 않는다 — 그 모듈은 가창자 전용
 * 수집기(pitchy 등)와 한 배럴에 묶여 있어, 청자까지 내려받게 되면 코드 분리가 무의미해진다.
 */
export async function fetchPlainLyrics(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`가사 원문을 불러오지 못했습니다 (${response.status})`);
  }

  return response.text();
}
