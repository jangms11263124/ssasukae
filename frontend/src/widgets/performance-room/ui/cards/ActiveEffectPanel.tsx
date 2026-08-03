'use client';

import { CARD_EFFECT_VISUALS, formatCardEffectValue } from '@/entities/card';

import { useCardStore } from '../../model/cardStore';

/** 우측 재생 곡 패널 아래에 표시하는 현재 발동 중인 카드 요약 */
export function ActiveEffectPanel() {
  const activeEffect = useCardStore((state) => state.activeEffect);

  if (activeEffect === null) {
    return null;
  }

  const visual = CARD_EFFECT_VISUALS[activeEffect.effectType];
  const valueLabel = formatCardEffectValue(activeEffect.effectType, activeEffect.effectValue);

  return (
    <div className="border border-fuchsia-500/50 bg-fuchsia-950/25 p-4">
      <p className="font-mono text-[10px] tracking-[0.24em] text-fuchsia-400">ACTIVE EFFECT</p>
      <p className="mt-2 flex items-center gap-2 text-sm font-black uppercase italic text-white">
        <WarningIcon />
        {visual.title}
        {valueLabel !== null ? <span className="font-mono not-italic">({valueLabel})</span> : null}
      </p>
      <p className="mt-1.5 break-keep text-xs leading-relaxed text-zinc-300">
        {activeEffect.description ?? visual.fallbackDescription}
      </p>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-fuchsia-400"
    >
      <path d="M12 4 21 19H3L12 4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.6" r="0.4" fill="currentColor" />
    </svg>
  );
}
