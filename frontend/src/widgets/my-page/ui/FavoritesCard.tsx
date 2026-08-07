import Link from 'next/link';

import type { FavoriteSongItem } from '@/entities/user';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';
import { SettingsPanel } from '@/shared/ui/panel/SettingsPanel';

import { FAVORITES_PREVIEW_COUNT } from '../config/preview';
import { formatCount } from '../lib/formatters';
import { ChevronRightIcon, HeartIcon } from './icons';
import { TrackThumbnail } from './TrackThumbnail';

interface FavoritesCardProps {
  count: number;
  items: FavoriteSongItem[];
}

export function FavoritesCard({ count, items }: FavoritesCardProps) {
  const previewItems = items.slice(0, FAVORITES_PREVIEW_COUNT);

  return (
    <SettingsPanel title="FAVORITES" icon={<HeartIcon />}>
      {/* 나머지 두 패널과 같은 자리에 둬야 세 카드의 액션이 한 줄로 맞는다. */}
      <Link
        href="/favorite"
        className={cn(
          jetBrainsMono.className,
          'absolute right-0 top-0 flex items-center gap-1.5 border border-white/10 bg-black/25 px-2.5 py-1.5 text-[0.5rem] font-bold tracking-[0.12em] text-zinc-400 transition-colors',
          'hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
        )}
      >
        VIEW_ALL_LIBRARY
        <ChevronRightIcon />
      </Link>

      {/* 목록은 최근 6개만 내려오므로, 전체 개수와 나란히 두어 미리보기임을 드러낸다. */}
      <div
        className={cn(
          jetBrainsMono.className,
          'mt-7 flex items-baseline justify-between gap-3 border-b border-white/[0.07] pb-3',
        )}
      >
        <span className="text-[0.5rem] font-bold tracking-[0.16em] text-zinc-600">
          RECENT TRACKS
        </span>
        <span className="text-[0.66rem] font-bold tracking-[0.12em] text-cyan-400">
          {formatCount(count)}_ITEMS
        </span>
      </div>

      {previewItems.length === 0 ? (
        <p
          className={cn(
            jetBrainsMono.className,
            'py-12 text-center text-[0.55rem] tracking-[0.12em] text-zinc-600',
          )}
        >
          [EMPTY] 찜한 곡이 없습니다.
        </p>
      ) : (
        <ul>
          {previewItems.map((song) => (
            <li
              key={song.songId}
              className="flex items-center gap-4 border-b border-white/[0.04] py-3.5 last:border-b-0"
            >
              <TrackThumbnail thumbnailUrl={song.thumbnailUrl} title={song.title} size={40} />

              <div className="min-w-0">
                <p className="truncate text-[0.82rem] font-bold text-zinc-100">{song.title}</p>
                <p
                  className={cn(
                    jetBrainsMono.className,
                    'mt-1 truncate text-[0.5rem] tracking-[0.12em] text-zinc-600',
                  )}
                >
                  {song.artist.toUpperCase()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsPanel>
  );
}
