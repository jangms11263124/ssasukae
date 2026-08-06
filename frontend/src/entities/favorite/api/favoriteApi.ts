import { apiClient } from '@/shared/api/client';

import type { FavoriteSong, FavoriteSongPage } from '../types';

export interface GetFavoriteSongsParams {
  query?: string;
  cursor?: number;
  /** 백엔드 제약: 20~50 */
  size?: number;
}

/** 찜한 곡 목록 조회 (GET /api/users/me/favorites) */
export function getFavoriteSongs(params: GetFavoriteSongsParams = {}): Promise<FavoriteSongPage> {
  const searchParams = new URLSearchParams();

  if (params.query) searchParams.set('query', params.query);
  if (params.cursor !== undefined) searchParams.set('cursor', String(params.cursor));
  if (params.size !== undefined) searchParams.set('size', String(params.size));

  const queryString = searchParams.toString();

  return apiClient<FavoriteSongPage>(
    `/api/users/me/favorites${queryString ? `?${queryString}` : ''}`,
    { auth: true },
  );
}

// 단건 조회 전용 API가 없어 목록을 순회하며 찾는다. 백엔드 최대 size로 요청 횟수를 줄인다.
const FIND_SCAN_SIZE = 50;
// 폭주 방지 상한 (50 x 20 = 1,000곡)
const FIND_SCAN_MAX_PAGES = 20;

/** 찜한 곡 단건 조회. 목록에 없으면(찜하지 않은 곡) null을 반환한다. */
export async function findFavoriteSong(songId: number): Promise<FavoriteSong | null> {
  let cursor: number | undefined;

  for (let page = 0; page < FIND_SCAN_MAX_PAGES; page += 1) {
    const result = await getFavoriteSongs({ cursor, size: FIND_SCAN_SIZE });
    const found = result.songs.find((song) => song.songId === songId);
    if (found) return found;
    if (result.nextCursor === null) return null;
    cursor = result.nextCursor;
  }

  return null;
}

/** 곡 찜 (PUT /api/users/me/favorites/{songId}) */
export function addFavoriteSong(songId: number): Promise<void> {
  return apiClient<void>(`/api/users/me/favorites/${songId}`, { method: 'PUT', auth: true });
}

/** 곡 찜 해제 (DELETE /api/users/me/favorites/{songId}) */
export function removeFavoriteSong(songId: number): Promise<void> {
  return apiClient<void>(`/api/users/me/favorites/${songId}`, { method: 'DELETE', auth: true });
}
