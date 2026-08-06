'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { favoriteQueryKeys, findFavoriteSong, formatFavoritedAt } from '@/entities/favorite';
import { formatSongDuration, SongThumbnail } from '@/entities/song';
import { FavoriteToggleButton } from '@/features/favorite-toggle';
import { ApiError } from '@/shared/api/client';
import { Skeleton } from '@/shared/ui/skeleton/Skeleton';

import { findSongInListCaches } from '../model/findSongInListCaches';
import { SongLyricsPanel } from './SongLyricsPanel';

function DetailSkeleton() {
  return (
    <div className="border border-white/10 bg-[#141417] p-8">
      <p role="status" className="sr-only">
        곡 정보를 불러오고 있어요.
      </p>

      <div className="flex flex-col gap-10 md:flex-row">
        <Skeleton tone="faint" className="size-64 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <Skeleton className="h-3 w-44" />
          <Skeleton tone="strong" className="mt-5 h-8 w-72 max-w-full" />
          <Skeleton tone="faint" className="mt-3 h-3 w-40" />
          <div className="mt-auto grid grid-cols-2 gap-px pt-8">
            <Skeleton tone="dim" className="h-20 border border-white/[0.06]" />
            <Skeleton tone="dim" className="h-20 border border-white/[0.06]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="border border-white/10 bg-[#141417] py-24 text-center">
      <p className="font-mono text-xs tracking-[0.2em] text-zinc-600">TRACK_NOT_FOUND</p>
      <p className="mt-3 text-sm text-zinc-500">
        찜한 곡 목록에서 찾을 수 없습니다. 찜을 해제했거나 존재하지 않는 곡입니다.
      </p>
      <Link
        href="/favorite"
        className="mt-6 inline-flex items-center gap-2 border border-white/15 bg-black/40 px-5 py-2.5 font-mono text-[0.62rem] font-bold tracking-[0.2em] text-zinc-300 transition-colors hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        BACK_TO_FAVORITES
      </Link>
    </div>
  );
}

interface LikedSongDetailSectionProps {
  songId: number;
}

export function LikedSongDetailSection({ songId }: LikedSongDetailSectionProps) {
  const queryClient = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: favoriteQueryKeys.detail(songId),
    queryFn: () => findFavoriteSong(songId),
    initialData: () => findSongInListCaches(queryClient, songId),
    // 4xx는 재시도해도 결과가 같다
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.status < 500) && failureCount < 2,
  });

  if (isPending) {
    return <DetailSkeleton />;
  }

  if (isError) {
    return (
      <p className="py-24 text-center font-mono text-xs tracking-[0.2em] text-red-400/80">
        {error instanceof Error ? error.message : 'FAILED_TO_LOAD_TRACK'}
      </p>
    );
  }

  if (data === null) {
    return <NotFoundState />;
  }

  return (
    <div>
      <div className="relative overflow-hidden border border-white/10 bg-[#141417] p-8">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-cyan-300/70 to-transparent"
        />

        <div className="flex flex-col gap-10 md:flex-row">
          <div className="relative shrink-0">
            <SongThumbnail
              src={data.thumbnailUrl}
              className="size-64 border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-60"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col py-1">
            <div className="flex items-start justify-between gap-4">
              <p className="font-mono text-[11px] tracking-[0.28em] text-cyan-300/90">
                SAVED_TRACK
              </p>
              <FavoriteToggleButton songId={data.songId} favorite iconClassName="size-6" />
            </div>

            <h2 className="mt-4 truncate font-sans text-3xl font-black uppercase tracking-tight text-white">
              {data.title}
            </h2>
            <p className="mt-2 truncate font-mono text-sm uppercase tracking-[0.2em] text-zinc-500">
              {data.artist}
            </p>

            <dl className="mt-auto grid grid-cols-1 gap-px border border-white/10 bg-white/10 pt-0 sm:grid-cols-2">
              <div className="bg-[#101013] p-5">
                <dt className="font-mono text-[0.52rem] font-bold tracking-[0.2em] text-zinc-600">
                  DURATION
                </dt>
                <dd className="mt-2 font-mono text-lg tracking-[0.14em] text-zinc-200">
                  {data.durationSeconds !== undefined
                    ? formatSongDuration(data.durationSeconds)
                    : '--:--'}
                </dd>
              </div>
              <div className="bg-[#101013] p-5">
                <dt className="font-mono text-[0.52rem] font-bold tracking-[0.2em] text-zinc-600">
                  LIKED_AT
                </dt>
                <dd className="mt-2 font-mono text-lg tracking-[0.14em] text-zinc-200">
                  {formatFavoritedAt(data.favoritedAt)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <SongLyricsPanel song={data} className="mt-6" />
    </div>
  );
}
