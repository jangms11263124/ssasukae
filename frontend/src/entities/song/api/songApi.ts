import { apiClient } from '@/shared/api/client';

import type { SongFilter, SongSearchResult } from '../types';

export interface SearchSongsParams {
  query?: string;
  filter?: SongFilter;
  cursor?: number;
  /** 백엔드 제약: 20~50 */
  size?: number;
}

export interface SongLyricsResponse {
  /** 가사 .txt(타임스탬프 없는 원문)의 presigned URL */
  lyricsUrl: string;
}

/**
 * 곡 가사 URL 발급 (GET /api/songs/{songId}/lyrics).
 * 공연 스냅샷의 lyricsDownloadUrl과 같은 파일(관리자 업로드 가사 원문)의 presigned URL을
 * 방 밖에서도 받는다. 가사가 등록되지 않은 곡은 4xx가 온다.
 */
export function getSongLyricsUrl(songId: number): Promise<SongLyricsResponse> {
  return apiClient<SongLyricsResponse>(`/api/songs/${songId}/lyrics`, { auth: true });
}

/** 곡 검색 (GET /api/songs) */
export function searchSongs(params: SearchSongsParams = {}): Promise<SongSearchResult> {
  const searchParams = new URLSearchParams();

  if (params.query) searchParams.set('query', params.query);
  if (params.filter) searchParams.set('filter', params.filter);
  if (params.cursor !== undefined) searchParams.set('cursor', String(params.cursor));
  if (params.size !== undefined) searchParams.set('size', String(params.size));

  const queryString = searchParams.toString();

  return apiClient<SongSearchResult>(`/api/songs${queryString ? `?${queryString}` : ''}`, {
    auth: true,
  });
}
