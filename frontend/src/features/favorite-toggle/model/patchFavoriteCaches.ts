import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { favoriteQueryKeys, type FavoriteSongPage } from '@/entities/favorite';
import type { SongSearchItem, SongSearchResult } from '@/entities/song';

function isSongSearchResult(value: unknown): value is SongSearchResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    Array.isArray((value as SongSearchResult).items) &&
    !('pages' in value)
  );
}

function isSongSearchInfiniteData(
  value: unknown,
): value is InfiniteData<SongSearchResult, number | undefined> {
  if (typeof value !== 'object' || value === null || !('pages' in value)) return false;
  const pages = (value as InfiniteData<SongSearchResult>).pages;
  return Array.isArray(pages) && pages.every((page) => isSongSearchResult(page));
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

function mapSongItems(items: SongSearchItem[], songId: number, favorite: boolean) {
  let changed = false;
  const next = items.map((item) => {
    if (item.songId !== songId || item.favorite === favorite) return item;
    changed = true;
    return { ...item, favorite };
  });
  return changed ? next : null;
}

/** 검색·찜 목록 캐시에 찜 여부를 즉시 반영한다. */
export function patchFavoriteCaches(
  queryClient: QueryClient,
  songId: number,
  favorite: boolean,
): void {
  queryClient.setQueriesData({ queryKey: ['songs', 'search'] }, (old) => {
    // SongSearchModal 등 infinite query: { pages: SongSearchResult[] }
    if (isSongSearchInfiniteData(old)) {
      let changed = false;
      const pages = old.pages.map((page) => {
        const items = mapSongItems(page.items, songId, favorite);
        if (!items) return page;
        changed = true;
        return { ...page, items };
      });
      return changed ? { ...old, pages } : old;
    }

    // NowPlaying 등 단일 검색 결과
    if (isSongSearchResult(old)) {
      const items = mapSongItems(old.items, songId, favorite);
      return items ? { ...old, items } : old;
    }

    return old;
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
