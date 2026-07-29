'use client';

import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { formatSongDuration, searchSongs, type SongFilter } from '@/entities/song';
import { cn } from '@/shared/lib/cn';

import type { StageSong } from '../../model/stageStore';
import { HeartIcon } from '../icons/HeartIcon';

const TABS = ['ALL', 'POPULAR', 'MY_FAVORITES'] as const;
type TabKey = (typeof TABS)[number];

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 20;

// MY_FAVORITES는 전용 필터가 검색 API에 없어 응답의 favorite 필드로 걸러낸다.
const TAB_TO_FILTER: Record<TabKey, SongFilter> = {
  ALL: 'ALL',
  POPULAR: 'POPULAR',
  MY_FAVORITES: 'ALL',
};

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

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-4"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

interface SongSearchModalProps {
  onClose: () => void;
  onSelectSong: (song: StageSong) => void;
}

export function SongSearchModal({ onClose, onSelectSong }: SongSearchModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  // 백엔드 제약: query는 2자 이상만 유효하다. 1자는 전체 목록으로 검색한다.
  const effectiveQuery = debouncedQuery.length >= 2 ? debouncedQuery : '';

  const {
    data,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['songs', 'search', effectiveQuery, TAB_TO_FILTER[activeTab]],
    queryFn: () =>
      searchSongs({
        query: effectiveQuery || undefined,
        filter: TAB_TO_FILTER[activeTab],
        size: SEARCH_PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const songs = (data?.items ?? []).filter(
    (song) => activeTab !== 'MY_FAVORITES' || song.favorite,
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="곡 검색 닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/65"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="곡 검색"
        className="relative flex max-h-[86dvh] w-full max-w-[880px] flex-col border border-white/10 bg-[#161619] shadow-[0_40px_120px_rgba(0,0,0,0.65)]"
      >
        <div className="flex items-start justify-between px-7 pt-7">
          <div>
            <p className="font-mono text-sm tracking-[0.3em] text-cyan-300">
              TRACK_ARCHIVE / SEARCH_PROTOCOL
            </p>
            <p className="mt-1.5 font-sans text-lg font-black uppercase italic tracking-tight text-white">
              ADD SONG
            </p>
            <p className="mt-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-cyan-200/80">
              <span
                aria-hidden="true"
                className={cn('size-1.5', isError ? 'bg-red-400' : 'bg-cyan-300')}
              />
              {isError ? 'LIBRARY_CONNECTION_ERROR' : 'LIBRARY_CONNECTION_ACTIVE'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid size-10 place-items-center border border-white/20 text-zinc-300 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-7 px-7">
          <div className="flex items-center gap-3 border border-white/15 bg-black/50 px-4">
            <span className="text-zinc-500">
              <SearchIcon />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="SEARCH BY SONG TITLE OR ARTIST"
              aria-label="곡 제목 또는 아티스트 검색"
              className="h-12 w-full bg-transparent font-mono text-sm tracking-[0.14em] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
            <span aria-hidden="true" className="font-mono text-zinc-600">
              ||
            </span>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="곡 필터"
          className="mt-5 flex gap-2 border-b border-white/10 px-7 font-mono text-sm tracking-[0.16em]"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'relative px-4 pb-3 pt-2.5 transition-colors',
                  isActive ? 'bg-white/5 text-white' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {tab}
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-fuchsia-500"
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto px-7" aria-label="곡 목록">
          {songs.map((song, index) => (
            <li
              key={song.songId}
              className="flex items-center gap-5 border-b border-white/5 py-3.5"
            >
              <span className="w-6 shrink-0 font-mono text-xs text-zinc-500">
                {String(index + 1).padStart(2, '0')}
              </span>
              {song.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={song.thumbnailUrl}
                  alt=""
                  className="size-11 shrink-0 border border-white/10 object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="size-11 shrink-0 border border-white/10 bg-[linear-gradient(135deg,#2c2c33,#131316)]"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{song.title}</p>
                <p className="mt-1 truncate font-mono text-[10px] tracking-[0.16em] text-zinc-500">
                  {song.artist}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs text-zinc-400">
                {formatSongDuration(song.durationSeconds)}
              </span>
              {/* 찜 토글 API 연동 전까지는 서버가 내려준 찜 상태를 표시만 한다. */}
              <span
                aria-label={song.favorite ? '찜한 곡' : undefined}
                className={cn(
                  'shrink-0',
                  song.favorite ? 'text-fuchsia-500' : 'text-zinc-600',
                )}
              >
                <HeartIcon filled={song.favorite} />
              </span>
              <button
                type="button"
                onClick={() => onSelectSong({ id: song.songId, title: song.title })}
                className="shrink-0 border border-white/25 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
              >
                + 노래 부르기
              </button>
            </li>
          ))}
          {isPending ? (
            <li className="py-12 text-center font-mono text-xs tracking-[0.2em] text-zinc-600">
              LOADING_TRACKS...
            </li>
          ) : null}
          {isError ? (
            <li className="py-12 text-center font-mono text-xs tracking-[0.2em] text-red-400/80">
              {error instanceof Error ? error.message : 'FAILED_TO_LOAD_TRACKS'}
            </li>
          ) : null}
          {!isPending && !isError && songs.length === 0 ? (
            <li className="py-12 text-center font-mono text-xs tracking-[0.2em] text-zinc-600">
              NO_TRACKS_FOUND
            </li>
          ) : null}
        </ul>

        <div className="mt-4 flex items-center justify-between bg-zinc-400/85 px-5 py-2 font-mono text-[10px] tracking-[0.2em] text-cyan-800">
          <div className="flex items-center gap-6">
            <span>{songs.length} TRACKS</span>
            <span>FILTER_{activeTab}</span>
            <span>{isError ? 'LIBRARY_OFFLINE' : 'LIBRARY_SYNCED'}</span>
          </div>
          <span aria-hidden="true" className="flex gap-0.5">
            <span className="h-3 w-1 bg-cyan-600" />
            <span className="h-3 w-1 bg-fuchsia-500" />
          </span>
        </div>
      </div>
    </div>
  );
}
