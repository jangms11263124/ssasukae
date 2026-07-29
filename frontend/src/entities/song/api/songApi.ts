import { apiClient } from '@/shared/api/client';

import type { SongFilter, SongSearchResult } from '../types';

export interface SearchSongsParams {
  query?: string;
  filter?: SongFilter;
  cursor?: number;
  /** 백엔드 제약: 20~50 */
  size?: number;
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
