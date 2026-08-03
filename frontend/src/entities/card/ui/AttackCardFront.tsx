import { cn } from '@/shared/lib/cn';

import {
  CARD_CLIP_PATH,
  CARD_EFFECT_VISUALS,
  CARD_TARGET_LABELS,
  CARD_TIER_VISUALS,
  formatCardEffectValue,
} from '../config/cardVisuals';
import type { CardEffectTargetType, CardEffectType, CardTier } from '../types';
import { CardEffectIcon } from './CardIcons';

interface AttackCardFrontProps {
  cardCode?: string;
  className?: string;
  description?: string;
  durationSeconds: number;
  effectType: CardEffectType;
  effectValue?: number | null;
  targetType: CardEffectTargetType;
  tier: CardTier;
}

/** 수성전 공격 카드 앞면. 등급별 프레임 + 효과 정보를 렌더링한다. */
export function AttackCardFront({
  cardCode,
  className,
  description,
  durationSeconds,
  effectType,
  effectValue,
  targetType,
  tier,
}: AttackCardFrontProps) {
  const effect = CARD_EFFECT_VISUALS[effectType];
  const tierVisual = CARD_TIER_VISUALS[tier];
  const valueLabel = formatCardEffectValue(effectType, effectValue);

  return (
    <div
      className={cn('relative aspect-[63/88] select-none p-[2px]', className)}
      style={{
        background: tierVisual.frameGradient,
        boxShadow: tierVisual.glow,
        clipPath: CARD_CLIP_PATH,
      }}
    >
      <div
        className="flex size-full flex-col bg-[#101016] px-3 pb-2.5 pt-3"
        style={{ clipPath: CARD_CLIP_PATH }}
      >
        <div className="flex items-center justify-between gap-1.5">
          <span className="whitespace-nowrap border border-cyan-400/50 bg-cyan-950/40 px-1 py-0.5 font-mono text-[8px] tracking-[0.04em] text-cyan-300">
            CODE_NAME: {cardCode ?? '----'}
          </span>
          <span className="whitespace-nowrap text-right font-mono text-[8px] tracking-[0.08em] text-zinc-400">
            {effect.categoryLabel}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-full p-[1.5px]" style={{ background: tierVisual.frameGradient }}>
            <div
              className="grid size-16 place-items-center rounded-full bg-[#101016]"
              style={{ color: tierVisual.iconColor }}
            >
              <CardEffectIcon
                effectType={effectType}
                className="size-8"
                gradientStops={tierVisual.iconGradientStops}
              />
            </div>
          </div>

          <p
            className="font-sans text-base font-black italic tracking-[0.06em] text-white"
            style={{
              textShadow: '1.5px 0 rgb(255 45 149 / 55%), -1.5px 0 rgb(34 211 238 / 55%)',
            }}
          >
            {effect.title}
          </p>

          <p className="px-1 break-keep text-[11px] leading-relaxed text-zinc-300">
            {description ?? effect.fallbackDescription}
          </p>

          {valueLabel ? (
            <p className="font-mono text-xl font-bold text-white">{valueLabel}</p>
          ) : null}
        </div>

        <div className="flex items-end justify-between font-mono text-[9px] tracking-[0.08em] text-zinc-400">
          <div className="text-left">
            <p>TARGET:</p>
            <p className="text-zinc-200">{CARD_TARGET_LABELS[targetType]}</p>
          </div>
          <div className="text-right">
            <p>DURATION:</p>
            <p className="text-zinc-200">{durationSeconds} SEC</p>
          </div>
        </div>

        <p className="mt-2 border-t border-white/10 pt-1.5 text-center font-mono text-[9px] tracking-[0.12em] text-cyan-300">
          USAGE: ONCE PER ROUND
        </p>
      </div>
    </div>
  );
}
