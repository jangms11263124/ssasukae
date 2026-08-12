'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/shared/lib/cn';

import { cardEffectKey, useCardStore } from '../../model/cardStore';

/** 반동이 잦아들 때까지의 시간. impact-shake keyframe 길이와 맞춘다 */
const SHAKE_MS = 500;

/**
 * 카드 발동 순간 무대 콘텐츠(캠·가사)를 통째로 흔드는 래퍼.
 * 오버레이가 아니라 무대 자체가 흔들려야 타격감이 산다.
 *
 * 컷인(CardImpactCutIn)과 같은 키로 "이 화면에서 새로 시작된 효과"에만 반응한다 —
 * 새로고침 복구분은 흔들지 않는다. 자식은 리마운트하지 않고 클래스만 잠깐 얹는다
 * (키 교체로 리마운트하면 캠 비디오가 다시 붙어 화면이 깜빡인다).
 */
export function CardImpactStageShake({ children }: { children: React.ReactNode }) {
  const activeEffect = useCardStore((state) => state.activeEffect);
  const effectKey = activeEffect === null ? null : cardEffectKey(activeEffect);

  const [playedKey, setPlayedKey] = useState(effectKey);
  const [shaking, setShaking] = useState(false);

  if (effectKey !== playedKey) {
    setPlayedKey(effectKey);
    setShaking(effectKey !== null);
  }

  useEffect(() => {
    if (!shaking) return;

    const timer = window.setTimeout(() => setShaking(false), SHAKE_MS);
    return () => window.clearTimeout(timer);
  }, [shaking, playedKey]);

  return <div className={cn('h-full w-full', shaking && 'animate-impact-shake')}>{children}</div>;
}
