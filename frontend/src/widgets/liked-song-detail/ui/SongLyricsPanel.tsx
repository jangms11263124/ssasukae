'use client';

import { useQuery } from '@tanstack/react-query';

import type { FavoriteSong } from '@/entities/favorite';
import { getSongLyricsUrl } from '@/entities/song';
import { fetchPlainLyrics } from '@/features/lyrics-sync';
import { ApiError } from '@/shared/api/client';
import { Skeleton } from '@/shared/ui/skeleton/Skeleton';

// 가사 줄 길이가 들쭉날쭉한 느낌을 내 실제 콘텐츠 자리처럼 보이게 한다.
const LYRICS_SKELETON_WIDTHS = [
  'w-[62%]',
  'w-[78%]',
  'w-[55%]',
  'w-[70%]',
  'w-[84%]',
  'w-[58%]',
  'w-[74%]',
  'w-[66%]',
];

async function getLyrics(songId: number): Promise<string[]> {
  const { lyricsUrl } = await getSongLyricsUrl(songId);
  const text = await fetchPlainLyrics(lyricsUrl);

  // 앞뒤 공백 줄만 정리하고 중간 빈 줄은 절 구분으로 보존한다.
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  return lines;
}

function LyricsEmptyState({ message }: { message: string }) {
  return (
    <div className="py-16 text-center">
      <p className="font-mono text-xs tracking-[0.2em] text-zinc-600">LYRICS_NOT_AVAILABLE</p>
      <p className="mt-3 text-sm text-zinc-500">{message}</p>
    </div>
  );
}

interface SongLyricsPanelProps {
  song: FavoriteSong;
  className?: string;
}

/** 백엔드가 발급한 URL로 관리자 업로드 가사 원문을 받아 보여준다. */
export function SongLyricsPanel({ song, className }: SongLyricsPanelProps) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['likedSongLyrics', song.songId],
    queryFn: () => getLyrics(song.songId),
    // 가사는 바뀌지 않으니 세션 동안 재조회하지 않는다.
    staleTime: Infinity,
    // 미등록 곡(4xx)은 재시도해도 결과가 같다
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.status < 500) && failureCount < 2,
  });

  return (
    <section aria-label="가사" className={className}>
      <div className="border border-white/10 bg-[#141417]">
        <div className="border-b border-white/10 px-6 py-4">
          <p className="font-mono text-[11px] font-bold tracking-[0.28em] text-cyan-300/90">
            LYRICS
          </p>
        </div>

        {isPending ? (
          <div className="space-y-3 px-6 py-8">
            <p role="status" className="sr-only">
              가사를 불러오고 있어요.
            </p>
            {LYRICS_SKELETON_WIDTHS.map((width, index) => (
              <Skeleton key={index} tone="faint" className={`h-3.5 ${width}`} />
            ))}
          </div>
        ) : isError ? (
          <LyricsEmptyState
            message={
              error instanceof ApiError && error.status < 500
                ? '이 곡의 가사가 아직 등록되지 않았어요.'
                : '가사를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
            }
          />
        ) : data.length === 0 ? (
          <LyricsEmptyState message="이 곡의 가사가 아직 등록되지 않았어요." />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto px-6 py-8 [scrollbar-width:thin] [scrollbar-color:rgb(113_113_122_/_0.4)_transparent]">
            <ul className="space-y-2.5">
              {data.map((line, index) => (
                <li
                  key={index}
                  className={
                    line.trim() === '' ? 'h-3' : 'text-[0.92rem] leading-relaxed text-zinc-300'
                  }
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
