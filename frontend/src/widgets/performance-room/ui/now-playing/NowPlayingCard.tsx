'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { DEFAULT_PERFORMANCE_SETTINGS } from '@/entities/performance';
import { searchSongs, SongThumbnail } from '@/entities/song';
import { FavoriteToggleButton } from '@/features/favorite-toggle';
import { cn } from '@/shared/lib/cn';

import { useStageStore, type StagePhase } from '../../model/stageStore';
import { RoomPanel } from '../RoomPanel';

const PHASE_SUBTITLES: Record<StagePhase, string> = {
  WAITING: 'waiting...',
  SINGER_SELECT: 'waiting...',
  SONG_SELECT: 'selecting song...',
  READY: 'ready to play',
  PERFORMING: 'now playing',
  SCORE: 'scoring...',
};

/** 키 오프셋을 +2 / 0 / -3 표기로 변환한다 */
function formatKeyOffset(keyOffset: number): string {
  return keyOffset > 0 ? `+${keyOffset}` : String(keyOffset);
}

/** 값이 바뀐 직후 강조를 유지하는 시간 */
const DSP_FLASH_MS = 1500;

/**
 * KEY·TEMPO 표시 한 칸. 제스처·슬라이더로 값이 바뀐 순간 시안색으로 잠깐 반짝여
 * 조작이 반영됐음을 알리고, 기본값이 아닌 동안에는 밝은 색을 유지해 눈에 띄게 한다.
 */
function DspStat({
  label,
  value,
  isDefault,
}: {
  label: string;
  value: string;
  isDefault: boolean;
}) {
  const [flashing, setFlashing] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current === value) return;
    prevValueRef.current = value;
    setFlashing(true);
    const timer = window.setTimeout(() => setFlashing(false), DSP_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <span
      className={cn(
        'tabular-nums transition-colors duration-300',
        flashing
          ? 'font-bold text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.7)]'
          : isDefault
            ? 'text-zinc-300'
            : 'font-semibold text-cyan-200',
      )}
    >
      {label}: {value}
    </span>
  );
}

export function NowPlayingCard() {
  const selectedSong = useStageStore((state) => state.selectedSong);
  const phase = useStageStore((state) => state.phase);
  const settings = useStageStore((state) => state.settings);

  // 스냅샷·이벤트에 내 찜 여부가 없어 곡 검색 API(favorite 필드 포함)로 조회한다.
  // FavoriteToggleButton이 ['songs', 'search']를 무효화하므로 토글 시 함께 갱신된다.
  const { data: favoriteData } = useQuery({
    queryKey: ['songs', 'search', 'now-playing', selectedSong?.id ?? null],
    queryFn: () => searchSongs({ query: selectedSong?.title ?? '' }),
    enabled: selectedSong !== null,
  });
  const favorite =
    favoriteData?.items.find((item) => item.songId === selectedSong?.id)?.favorite ?? false;

  const title = selectedSong?.title ?? 'LOADING';
  const subtitle = PHASE_SUBTITLES[phase];

  return (
    <RoomPanel className="relative overflow-hidden p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(168,85,247,0.18),transparent_60%)]"
      />

      <div className="relative">
        <div className="flex items-start gap-3">
          <SongThumbnail src={selectedSong?.thumbnailUrl ?? null} className="size-16" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.24em] text-fuchsia-400">
              {phase === 'PERFORMING' ? 'LIVE PLAYING' : 'UP NEXT'}
            </p>
            <p className="mt-1 truncate text-lg font-black uppercase italic leading-tight text-white">
              {title}
            </p>
            <p className="truncate font-mono text-xs text-zinc-500">{subtitle}</p>
          </div>
          {selectedSong !== null ? (
            <FavoriteToggleButton
              songId={selectedSong.id}
              favorite={favorite}
              iconClassName="size-6"
            />
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between font-mono text-[11px] tracking-wide text-zinc-500">
          <DspStat
            label="KEY"
            value={formatKeyOffset(settings.keyOffset)}
            isDefault={settings.keyOffset === DEFAULT_PERFORMANCE_SETTINGS.keyOffset}
          />
          <DspStat
            label="TEMPO"
            value={`${settings.tempoPercent}%`}
            isDefault={settings.tempoPercent === DEFAULT_PERFORMANCE_SETTINGS.tempoPercent}
          />
          <span>
            DIFFICULTY:{' '}
            {selectedSong?.difficultyLevel != null ? `LV.${selectedSong.difficultyLevel}` : '-'}
          </span>
        </div>
      </div>
    </RoomPanel>
  );
}
