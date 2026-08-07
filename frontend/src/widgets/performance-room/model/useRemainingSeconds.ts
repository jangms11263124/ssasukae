'use client';

import { useEffect, useState } from 'react';

import { useCardStore } from './cardStore';

const TICK_INTERVAL_MS = 200;

/**
 * 서버 시각 기준 목표 시각까지 남은 초. 로컬에서 초를 새로 세지 않고
 * 매 틱마다 (목표 시각 - 보정된 현재 시각)을 다시 계산해 탭 정지에도 어긋나지 않는다.
 *
 * **목표가 있는 동안에만 마운트해야 한다.** 목표가 없을 때도 살려 두면 틱을 멈춰야 하는데,
 * 그 사이 시계가 낡아 다음 목표의 첫 프레임에 "남은 시간 + 그동안 흐른 시간"이 찍힌다.
 * 마운트 시점에 시계를 잡으므로, 호출부가 목표 유무로 컴포넌트를 갈아 끼우면 그 함정이 없다.
 */
export function useRemainingSeconds(targetAtIso: string): number {
  const clockOffsetMs = useCardStore((state) => state.clockOffsetMs);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => setNowMs(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  const remainingMs = new Date(targetAtIso).getTime() - (nowMs + clockOffsetMs);
  return Math.max(0, Math.ceil(remainingMs / 1000));
}
