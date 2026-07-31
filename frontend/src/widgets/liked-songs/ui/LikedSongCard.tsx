import { formatFavoritedAt, type FavoriteSong } from '@/entities/favorite';
import { formatSongDuration, SongThumbnail } from '@/entities/song';
import { FavoriteToggleButton } from '@/features/favorite-toggle';

interface LikedSongCardProps {
  song: FavoriteSong;
  /** 전체 목록 기준 0부터 시작하는 순번 */
  index: number;
}

export function LikedSongCard({ song, index }: LikedSongCardProps) {
  return (
    <article className="flex gap-6 border border-white/10 bg-[#161619] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
      <SongThumbnail src={song.thumbnailUrl} className="size-36" />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <p className="font-mono text-sm tracking-[0.3em] text-cyan-300">
            TRACK <span className="text-zinc-500">{'//'}</span> {String(index + 1).padStart(3, '0')}
          </p>
          <FavoriteToggleButton songId={song.songId} favorite />
        </div>

        <p className="mt-2 truncate font-sans text-lg font-black uppercase tracking-tight text-white">
          {song.title}
        </p>
        <p className="mt-1 truncate font-mono text-xs uppercase tracking-[0.22em] text-zinc-500">
          {song.artist}
        </p>

        <div className="mt-auto flex flex-wrap gap-2 pt-4 font-mono text-[11px] tracking-[0.14em] text-zinc-400">
          {song.durationSeconds !== undefined ? (
            <span className="border border-white/15 bg-black/40 px-2.5 py-1">
              {formatSongDuration(song.durationSeconds)}
            </span>
          ) : null}
          <span className="border border-white/15 bg-black/40 px-2.5 py-1">
            LIKED:{formatFavoritedAt(song.favoritedAt)}
          </span>
        </div>
      </div>
    </article>
  );
}
