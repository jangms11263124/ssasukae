'use client';

import { useEffect, useState } from 'react';

import { useCardStore } from './cardStore';

const TICK_INTERVAL_MS = 200;

/**
 * 서버 시각 기준 목표 시각까지 남은 초. 로컬에서 초를 새로 세지 않고
 * 매 틱마다 (목표 시각 - 보정된 현재 시각)을 다시 계산해 탭 정지에도 어긋나지 않는다.
 */
export function useRemainingSeconds(targetAtIso: string | null): number {
  const clockOffsetMs = useCardStore((state) => state.clockOffsetMs);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (targetAtIso === null) {
      return;
    }

    const intervalId = setInterval(() => setNowMs(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [targetAtIso]);

  if (targetAtIso === null) {
    return 0;
  }

  const remainingMs = new Date(targetAtIso).getTime() - (nowMs + clockOffsetMs);
  return Math.max(0, Math.ceil(remainingMs / 1000));
}
