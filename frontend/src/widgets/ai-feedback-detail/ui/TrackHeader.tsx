import { SongThumbnail } from '@/entities/song';

interface TrackHeaderProps {
  performanceId: number;
  title: string;
  artist: string;
  thumbnail: string | null;
}

export function TrackHeader({ performanceId, title, artist, thumbnail }: TrackHeaderProps) {
  return (
    <header className="flex items-center gap-6">
      <SongThumbnail src={thumbnail} className="size-24" />

      <div className="min-w-0">
        <p className="font-mono text-[0.62rem] font-bold tracking-[0.24em] text-fuchsia-400">
          TRACK_{String(performanceId).padStart(2, '0')}
        </p>
        {/* 페이지 h1은 셸의 "Analysis Report."가 담당한다 */}
        <h2 className="mt-2 truncate font-sans text-3xl font-black tracking-tight text-white">
          {title}
        </h2>
        <p className="mt-1.5 truncate font-mono text-[0.7rem] tracking-[0.2em] text-zinc-400">
          {artist}
        </p>
      </div>
    </header>
  );
}
