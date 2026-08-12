'use client';

import { useLayoutEffect, useRef } from 'react';

import { CARD_RADIUS } from '@/entities/card';

/**
 * 방에 처음 들어온 시각. 카드마다 마운트 시점이 달라도(내 카드는 배분 때, 상대 카드는
 * 시드 때) 이 공통 기준에 맞춰 위상을 당겨 두면 화면의 모든 카드가 같이 반짝인다.
 */
const SHEEN_EPOCH_MS = typeof performance === 'undefined' ? 0 : performance.now();

/**
 * 카드 위를 훑고 지나가는 광택 한 겹. 색만 등급별로 갈아 끼운다.
 * 반짝임 타이밍은 화면의 모든 카드가 공유한다.
 */
export function CardSheen({ color }: { color: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;

    // 애니메이션은 무한 반복이라, 지난 만큼 음수 delay로 당기면 공통 위상에 합류한다.
    const durationMs = parseFloat(getComputedStyle(element).animationDuration) * 1000;
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;

    element.style.animationDelay = `${-((performance.now() - SHEEN_EPOCH_MS) % durationMs)}ms`;
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ borderRadius: CARD_RADIUS }}
    >
      <div
        ref={ref}
        className="absolute inset-y-0 left-0 w-1/2 animate-mini-card-sheen"
        style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }}
      />
    </div>
  );
}
