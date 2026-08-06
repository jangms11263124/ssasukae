'use client';

import { CARD_ASPECT, CARD_RADIUS, CARD_TIER_VISUALS } from '../config/cardVisuals';
import type { CardTier } from '../types';
import { CardTiltShell } from './CardTiltShell';
import { StarCubeIcon } from './CardIcons';

interface AttackCardBackProps {
  className?: string;
  /** 호버 틸트. 기본 true */
  interactive?: boolean;
  /** false면 외곽 box-shadow 제거 (딜 연출 3D 회전용) */
  showFrameGlow?: boolean;
  tier: CardTier;
}

/** 수성전 공격 카드 뒷면. TCG 비율·둥근 모서리 + 기존 등급 프레임 UI. */
export function AttackCardBack({
  className,
  interactive = true,
  showFrameGlow = true,
  tier,
}: AttackCardBackProps) {
  const tierVisual = CARD_TIER_VISUALS[tier];

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
          className="relative flex size-full flex-col items-center justify-center gap-4 overflow-hidden bg-[#101016] p-4"
          style={{ borderRadius: CARD_RADIUS }}
        >
          <div className="rounded-full p-[1.5px]" style={{ background: tierVisual.frameGradient }}>
            <div
              className="grid size-16 place-items-center rounded-full bg-[#101016]"
              style={{ color: tierVisual.iconColor }}
            >
              <StarCubeIcon className="size-8" gradientStops={tierVisual.iconGradientStops} />
            </div>
          </div>

          <div className="text-center">
            <p className="font-sans text-2xl font-black italic tracking-[0.04em] text-white">STAR</p>
            <p
              className="mt-1 font-mono text-[10px] tracking-[0.3em]"
              style={
                tier === 'P'
                  ? {
                      backgroundImage: tierVisual.frameGradient,
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                    }
                  : { color: tierVisual.iconColor }
              }
            >
              {tierVisual.label} CARD
            </p>
          </div>
        </div>
      </div>
    </CardTiltShell>
  );
}
