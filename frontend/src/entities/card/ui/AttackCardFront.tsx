'use client';

import {
  CARD_ASPECT,
  CARD_EFFECT_VISUALS,
  CARD_RADIUS,
  CARD_TARGET_LABELS,
  CARD_TIER_VISUALS,
  formatCardEffectValue,
} from '../config/cardVisuals';
import type { CardEffectTargetType, CardEffectType, CardTier } from '../types';
import { CardEffectIcon } from './CardIcons';
import { CardTiltShell } from './CardTiltShell';

interface AttackCardFrontProps {
  cardCode?: string;
  className?: string;
  description?: string;
  durationSeconds: number;
  effectType: CardEffectType;
  effectValue?: number | null;
  /** 호버 틸트. 기본 true */
  interactive?: boolean;
  /** false면 외곽 box-shadow 제거 (딜 연출 3D 회전용) */
  showFrameGlow?: boolean;
  targetType: CardEffectTargetType;
  tier: CardTier;
}

/** 수성전 공격 카드 앞면. TCG 비율·둥근 모서리 + 기존 등급 프레임 UI. */
export function AttackCardFront({
  cardCode,
  className,
  description,
  durationSeconds,
  effectType,
  effectValue,
  interactive = true,
  showFrameGlow = true,
  targetType,
  tier,
}: AttackCardFrontProps) {
  const effect = CARD_EFFECT_VISUALS[effectType];
  const tierVisual = CARD_TIER_VISUALS[tier];
  const valueLabel = formatCardEffectValue(effectType, effectValue);

  return (
    <CardTiltShell className={className} interactive={interactive}>
      <div
        className="relative size-full select-none overflow-hidden p-[2px]"
        style={{
          aspectRatio: CARD_ASPECT,
          borderRadius: CARD_RADIUS,
          background: tierVisual.frameGradient,
          boxShadow: showFrameGlow ? tierVisual.glow : undefined,
        }}
      >
        <div
          className="flex size-full flex-col overflow-hidden bg-[#101016] px-3 pb-2.5 pt-3"
          style={{ borderRadius: CARD_RADIUS }}
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
    </CardTiltShell>
  );
}
