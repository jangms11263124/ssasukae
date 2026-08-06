import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { favoriteQueryKeys, type FavoriteSong, type FavoriteSongPage } from '@/entities/favorite';

function isFavoriteInfiniteData(
  value: unknown,
): value is InfiniteData<FavoriteSongPage, number | undefined> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pages' in value &&
    Array.isArray((value as InfiniteData<FavoriteSongPage>).pages)
  );
}

/** 목록 캐시에 이미 있는 곡이면 상세 초기 데이터로 재사용해 스켈레톤 없이 바로 보여준다. */
export function findSongInListCaches(
  queryClient: QueryClient,
  songId: number,
): FavoriteSong | undefined {
  const entries = queryClient.getQueriesData({ queryKey: favoriteQueryKeys.all });

  for (const [, data] of entries) {
    if (!isFavoriteInfiniteData(data)) continue;
    for (const page of data.pages) {
      const found = page.songs.find((song) => song.songId === songId);
      if (found) return found;
    }
  }

  return undefined;
}
