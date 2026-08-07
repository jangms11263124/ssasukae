'use client';

import { CARD_EFFECT_VISUALS } from '@/entities/card';

import { useCardStore } from '../../model/cardStore';

/**
 * 효과가 걸려 있는 동안 무대 테두리를 효과색으로 맥동시킨다.
 *
 * 음정·템포 카드는 소리로만 바뀌어 화면만 봐서는 공격당하는 중인지 알 수 없다.
 * 무대를 가리지 않으면서 상태를 계속 알리는 역할이라 안쪽 그림자만 쓴다.
 */
export function CardEffectStageGlow() {
  const activeEffect = useCardStore((state) => state.activeEffect);

  if (activeEffect === null) {
    return null;
  }

  const { accent } = CARD_EFFECT_VISUALS[activeEffect.effectType];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 animate-card-effect-pulse"
      style={{ boxShadow: `inset 0 0 90px ${accent}59, inset 0 0 0 2px ${accent}80` }}
    />
  );
}
