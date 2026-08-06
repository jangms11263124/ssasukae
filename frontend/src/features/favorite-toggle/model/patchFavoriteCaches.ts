import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { favoriteQueryKeys, type FavoriteSongPage } from '@/entities/favorite';
import type { SongSearchResult } from '@/entities/song';

function isSongSearchResult(value: unknown): value is SongSearchResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    Array.isArray((value as SongSearchResult).items)
  );
}

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

/** 검색·찜 목록 캐시에 찜 여부를 즉시 반영한다. */
export function patchFavoriteCaches(
  queryClient: QueryClient,
  songId: number,
  favorite: boolean,
): void {
  queryClient.setQueriesData({ queryKey: ['songs', 'search'] }, (old) => {
    if (!isSongSearchResult(old)) return old;

    let changed = false;
    const items = old.items.map((item) => {
      if (item.songId !== songId || item.favorite === favorite) return item;
      changed = true;
      return { ...item, favorite };
    });

    return changed ? { ...old, items } : old;
  });

  queryClient.setQueriesData({ queryKey: favoriteQueryKeys.all }, (old) => {
    if (!isFavoriteInfiniteData(old)) return old;

    // 찜 해제 시에만 목록에서 제거한다. 추가는 곡 메타가 없어 성공 후 invalidate에 맡긴다.
    if (favorite) return old;

    let changed = false;
    const pages = old.pages.map((page) => {
      const nextSongs = page.songs.filter((song) => song.songId !== songId);
      if (nextSongs.length === page.songs.length) return page;
      changed = true;
      return {
        ...page,
        songs: nextSongs,
        totalCount: Math.max(0, page.totalCount - (page.songs.length - nextSongs.length)),
      };
    });

    return changed ? { ...old, pages } : old;
  });
}
