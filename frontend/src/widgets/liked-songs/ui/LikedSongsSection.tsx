'use client';

import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { favoriteQueryKeys, getFavoriteSongs } from '@/entities/favorite';
import { FavoriteToggleButton } from '@/features/favorite-toggle';
import { SongSearchModal } from '@/features/song-search';
import { cn } from '@/shared/lib/cn';
import { useInfiniteScrollTrigger } from '@/shared/lib/useInfiniteScrollTrigger';

import { LikedSongCard } from './LikedSongCard';
import { LikedSongCardSkeleton } from './LikedSongCardSkeleton';

const SEARCH_DEBOUNCE_MS = 200;
/** 스크롤이 멈춘 뒤 스크롤바를 숨기기까지의 시간 */
const SCROLLBAR_HIDE_MS = 900;
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

function SearchSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-4 shrink-0 rounded-full border-2 border-cyan-300/25 border-t-cyan-300 animate-spin',
        className,
      )}
    />
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

function SkeletonGrid({
  count,
  className,
  animateIn = false,
}: {
  count: number;
  className?: string;
  /** 다음 페이지 로드 시 아래에서 떠오르며 등장 */
  animateIn?: boolean;
}) {
  return (
    <ul aria-hidden="true" className={cn('grid gap-6 lg:grid-cols-2', className)}>
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className={animateIn ? 'animate-skeleton-fade-in' : undefined}
          style={animateIn ? { animationDelay: `${index * 80}ms` } : undefined}
        >
          <LikedSongCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

interface LikedSongsSectionProps {
  className?: string;
}

export function LikedSongsSection({ className }: LikedSongsSectionProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const hideScrollbarTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  // 스크롤 중에만 얇은 스크롤바를 잠깐 보여 준다.
  useEffect(() => {
    if (!scrollRoot) return;

    const handleScroll = () => {
      setIsScrolling(true);
      if (hideScrollbarTimerRef.current !== null) {
        window.clearTimeout(hideScrollbarTimerRef.current);
      }
      hideScrollbarTimerRef.current = window.setTimeout(() => {
        setIsScrolling(false);
        hideScrollbarTimerRef.current = null;
      }, SCROLLBAR_HIDE_MS);
    };

    scrollRoot.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollRoot.removeEventListener('scroll', handleScroll);
      if (hideScrollbarTimerRef.current !== null) {
        window.clearTimeout(hideScrollbarTimerRef.current);
      }
    };
  }, [scrollRoot]);

  const {
    data,
    isPending,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
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
    scrollRoot,
  );

  const songs = data?.pages.flatMap((page) => page.songs) ?? [];
  const totalCount = data?.pages[0]?.totalCount ?? 0;
  const trimmedQuery = query.trim();
  // debounce 대기이거나, 검색어 변경으로 이전 목록을 placeholder로 보여주는 중
  const isSearchLoading = trimmedQuery !== debouncedQuery || isPlaceholderData;
  const showListSkeleton = isPending || isSearchLoading;

  return (
    <section aria-label="찜한 노래 목록" className={cn('flex min-h-0 flex-col', className)}>
      <div className="shrink-0 space-y-5 border-b border-white/10 pb-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="text-sm text-zinc-400">Your private collection of saved tracks.</p>
          <p className="border-l border-white/15 pl-6 font-mono text-sm tracking-[0.3em] text-cyan-300">
            {isSearchLoading ? (
              <span className="inline-flex items-center gap-2 text-zinc-500">
                <SearchSpinner className="size-3" />
                SEARCHING...
              </span>
            ) : (
              <>
                <span className="text-white">{totalCount}</span> SAVED TRACKS
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
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
              aria-busy={isSearchLoading}
              className="h-12 w-full bg-transparent font-mono text-sm tracking-[0.14em] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
            {isSearchLoading ? <SearchSpinner /> : null}
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
      </div>

      <div
        ref={setScrollRoot}
        data-scrolling={isScrolling ? 'true' : 'false'}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          // 폭은 항상 확보하고 썸 색만 바꿔, 나타날 때 레이아웃이 안 흔들리게 한다.
          '[scrollbar-width:thin] [scrollbar-color:transparent_transparent]',
          '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent',
          '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent',
          '[&::-webkit-scrollbar-thumb]:transition-[background-color] [&::-webkit-scrollbar-thumb]:duration-300',
          'data-[scrolling=true]:[scrollbar-color:rgb(113_113_122_/_0.55)_transparent]',
          'data-[scrolling=true]:[&::-webkit-scrollbar-thumb]:bg-zinc-500/55',
        )}
      >
        <div className="py-6 pr-1">
          {showListSkeleton ? (
            <>
              <p role="status" className="sr-only">
                {isPending ? '찜한 노래 목록을 불러오고 있어요.' : '검색 결과를 불러오고 있어요.'}
              </p>
              <SkeletonGrid count={SKELETON_COUNT} animateIn={isSearchLoading && !isPending} />
            </>
          ) : null}
          {!showListSkeleton && isError ? (
            <p className="py-24 text-center font-mono text-xs tracking-[0.2em] text-red-400/80">
              {error instanceof Error ? error.message : 'FAILED_TO_LOAD_TRACKS'}
            </p>
          ) : null}
          {!showListSkeleton && !isError && songs.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-mono text-xs tracking-[0.2em] text-zinc-600">NO_SAVED_TRACKS</p>
              <p className="mt-3 text-sm text-zinc-500">
                {debouncedQuery
                  ? '검색 결과가 없습니다.'
                  : 'ADD SONG 버튼으로 마음에 드는 곡을 찜해 보세요.'}
              </p>
            </div>
          ) : null}

          {!showListSkeleton && songs.length > 0 ? (
            <ul className="grid gap-6 lg:grid-cols-2">
              {songs.map((song) => (
                <li key={song.songId}>
                  <LikedSongCard song={song} />
                </li>
              ))}
            </ul>
          ) : null}

          {!showListSkeleton && isFetchingNextPage ? (
            <SkeletonGrid count={NEXT_PAGE_SKELETON_COUNT} className="mt-6" animateIn />
          ) : null}
          {/* IntersectionObserver는 높이 0짜리 요소를 교차로 판정하지 않으므로 최소 높이를 준다. */}
          <div ref={sentinelRef} aria-hidden="true" className="h-px" />
        </div>
      </div>

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
