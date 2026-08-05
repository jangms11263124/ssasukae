'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { favoriteQueryKeys, getFavoriteSongs } from '@/entities/favorite';
import { FavoriteToggleButton } from '@/features/favorite-toggle';
import { SongSearchModal } from '@/features/song-search';
import { cn } from '@/shared/lib/cn';
import { useInfiniteScrollTrigger } from '@/shared/lib/useInfiniteScrollTrigger';

import { LikedSongCard } from './LikedSongCard';
import { LikedSongCardSkeleton } from './LikedSongCardSkeleton';

const SEARCH_DEBOUNCE_MS = 300;
// 백엔드 제약: size는 20~50
const PAGE_SIZE = 20;
// 첫 로딩은 2열 그리드 두 줄을 채워 목록이 들어올 자리를 보여준다.
const SKELETON_COUNT = 4;
const NEXT_PAGE_SKELETON_COUNT = 2;

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-4.5 shrink-0"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      className="size-4"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SkeletonGrid({ count, className }: { count: number; className?: string }) {
  return (
    <ul aria-hidden="true" className={cn('grid gap-6 lg:grid-cols-2', className)}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <LikedSongCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

export function LikedSongsSection() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  const {
    data,
    isPending,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: favoriteQueryKeys.list(debouncedQuery),
    queryFn: ({ pageParam }) =>
      getFavoriteSongs({
        query: debouncedQuery || undefined,
        cursor: pageParam,
        size: PAGE_SIZE,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  const sentinelRef = useInfiniteScrollTrigger(
    fetchNextPage,
    Boolean(hasNextPage) && !isFetchingNextPage,
  );

  const songs = data?.pages.flatMap((page) => page.songs) ?? [];
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  return (
    <section aria-label="찜한 노래 목록">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-sm text-zinc-400">Your private collection of saved tracks.</p>
        <p className="border-l border-white/15 pl-6 font-mono text-sm tracking-[0.3em] text-cyan-300">
          <span className="text-white">{totalCount}</span> SAVED TRACKS
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex w-full max-w-[560px] items-center gap-3 border border-white/30 bg-black/60 px-4 transition-colors focus-within:border-cyan-300/60">
          <span className="text-zinc-500">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="SEARCH_MY_LIBRARY..."
            aria-label="찜한 노래 검색"
            className="h-12 w-full bg-transparent font-mono text-sm tracking-[0.14em] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="ml-auto flex items-center gap-2 bg-white px-6 py-3.5 font-mono text-sm font-bold tracking-[0.2em] text-zinc-950 transition-colors hover:bg-cyan-200"
        >
          <PlusIcon />
          ADD SONG
        </button>
      </div>

      {isPending ? (
        <>
          <p role="status" className="sr-only">
            찜한 노래 목록을 불러오고 있어요.
          </p>
          <SkeletonGrid count={SKELETON_COUNT} className="mt-8" />
        </>
      ) : null}
      {isError ? (
        <p className="py-24 text-center font-mono text-xs tracking-[0.2em] text-red-400/80">
          {error instanceof Error ? error.message : 'FAILED_TO_LOAD_TRACKS'}
        </p>
      ) : null}
      {!isPending && !isError && songs.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-mono text-xs tracking-[0.2em] text-zinc-600">NO_SAVED_TRACKS</p>
          <p className="mt-3 text-sm text-zinc-500">
            {debouncedQuery
              ? '검색 결과가 없습니다.'
              : 'ADD SONG 버튼으로 마음에 드는 곡을 찜해 보세요.'}
          </p>
        </div>
      ) : null}

      {songs.length > 0 ? (
        <ul className="mt-8 grid gap-6 lg:grid-cols-2">
          {songs.map((song, index) => (
            <li key={song.songId}>
              <LikedSongCard song={song} index={index} />
            </li>
          ))}
        </ul>
      ) : null}

      {isFetchingNextPage ? (
        <SkeletonGrid count={NEXT_PAGE_SKELETON_COUNT} className="mt-6" />
      ) : null}
      {/* IntersectionObserver는 높이 0짜리 요소를 교차로 판정하지 않으므로 최소 높이를 준다. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      {isModalOpen ? (
        <SongSearchModal
          onClose={() => setIsModalOpen(false)}
          renderSongAction={(song) => (
            <FavoriteToggleButton songId={song.songId} favorite={song.favorite} />
          )}
        />
      ) : null}
    </section>
  );
}
