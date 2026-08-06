import { formatFavoritedAt, type FavoriteSong } from '@/entities/favorite';
import { formatSongDuration, SongThumbnail } from '@/entities/song';
import { FavoriteToggleButton } from '@/features/favorite-toggle';
import { cn } from '@/shared/lib/cn';

interface LikedSongCardProps {
  song: FavoriteSong;
  /** 전체 목록 기준 0부터 시작하는 순번 */
  index: number;
}

export function LikedSongCard({ song, index }: LikedSongCardProps) {
  const trackNo = String(index + 1).padStart(3, '0');

  return (
    <article
      className={cn(
        'group relative flex gap-5 overflow-hidden border border-white/10 bg-[#141417] p-4',
        'transition-[border-color,background-color,transform] duration-200',
        'hover:border-cyan-300/35 hover:bg-[#18181c]',
      )}
    >
      {/* 좌측 시안 액센트 — 호버 시만 또렷해짐 */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-cyan-300/0 to-transparent transition-all duration-200 group-hover:via-cyan-300/70"
      />

      <div className="relative shrink-0">
        <SongThumbnail
          src={song.thumbnailUrl}
          className="size-32 border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-60"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[11px] tracking-[0.28em] text-cyan-300/90">
            TRACK <span className="text-zinc-600">{'//'}</span>{' '}
            <span className="text-cyan-200">{trackNo}</span>
          </p>
          <FavoriteToggleButton
            songId={song.songId}
            favorite
            className="opacity-80 transition-opacity group-hover:opacity-100"
          />
        </div>

        <h2 className="mt-2.5 truncate font-sans text-base font-black uppercase tracking-tight text-zinc-50 transition-colors group-hover:text-white">
          {song.title}
        </h2>
        <p className="mt-1 truncate font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          {song.artist}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 font-mono text-[10px] tracking-[0.16em] text-zinc-400">
          {song.durationSeconds !== undefined ? (
            <span className="border border-white/10 bg-black/50 px-2 py-1 text-zinc-300">
              {formatSongDuration(song.durationSeconds)}
            </span>
          ) : null}
          <span className="border border-white/10 bg-black/50 px-2 py-1">
            LIKED <span className="text-zinc-600">{'::'}</span> {formatFavoritedAt(song.favoritedAt)}
          </span>
        </div>
      </div>
    </article>
  );
}
