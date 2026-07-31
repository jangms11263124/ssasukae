'use client';

import { useState } from 'react';

import { useStageStore } from '../../model/stageStore';
import { HeartIcon } from '@/shared/ui/icons/HeartIcon';
import { RoomPanel } from '../RoomPanel';

// 오디오 엔진이 붙기 전까지 사용하는 목업 재생 정보.
const MOCK_PLAYBACK = {
  bpm: 124,
  key: 'EM',
  progressPercent: 85,
  quality: 'HIGH-RES',
} as const;

export function NowPlayingCard() {
  const selectedSong = useStageStore((state) => state.selectedSong);
  const [isLiked, setIsLiked] = useState(false);

  const title = selectedSong?.title ?? 'LOADING';
  const subtitle = selectedSong ? 'ready to play' : 'waiting...';

  return (
    <RoomPanel className="relative overflow-hidden p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(168,85,247,0.18),transparent_60%)]"
      />

      <div className="relative">
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="size-16 shrink-0 border border-white/15 bg-[linear-gradient(135deg,#2c2440,#131316)]"
          />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.24em] text-fuchsia-400">
              LIVE PLAYING
            </p>
            <p className="mt-1 truncate text-lg font-black uppercase italic leading-tight text-white">
              {title}
            </p>
            <p className="truncate font-mono text-xs text-zinc-500">{subtitle}</p>
          </div>
          <button
            type="button"
            aria-pressed={isLiked}
            aria-label="현재 곡 좋아요"
            onClick={() => setIsLiked((prev) => !prev)}
            className={
              isLiked
                ? 'shrink-0 text-fuchsia-500 transition-colors'
                : 'shrink-0 text-fuchsia-400/70 transition-colors hover:text-fuchsia-300'
            }
          >
            <HeartIcon filled={isLiked} className="size-6" />
          </button>
        </div>

        <div className="mt-4">
          <div className="flex justify-between font-mono text-[10px] text-zinc-400">
            <span>00:00</span>
            <span>00:00</span>
          </div>
          <div className="relative mt-1.5 h-1 bg-white/15">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-300 to-fuchsia-500"
              style={{ width: `${MOCK_PLAYBACK.progressPercent}%` }}
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 bg-white"
              style={{ left: `${MOCK_PLAYBACK.progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between font-mono text-[9px] tracking-wide text-zinc-500">
          <span>KEY: {MOCK_PLAYBACK.key}</span>
          <span>BPM: {MOCK_PLAYBACK.bpm}</span>
          <span>QUALITY: {MOCK_PLAYBACK.quality}</span>
        </div>
      </div>
    </RoomPanel>
  );
}
