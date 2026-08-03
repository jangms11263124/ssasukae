import { cn } from '@/shared/lib/cn';

import { CARD_CLIP_PATH, CARD_TIER_VISUALS } from '../config/cardVisuals';
import type { CardTier } from '../types';
import { StarCubeIcon } from './CardIcons';

interface AttackCardBackProps {
  className?: string;
  tier: CardTier;
}

/** 수성전 공격 카드 뒷면. 등급(실버/골드/플래티넘) 프레임으로 렌더링한다. */
export function AttackCardBack({ className, tier }: AttackCardBackProps) {
  const tierVisual = CARD_TIER_VISUALS[tier];

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
        className="relative flex size-full flex-col items-center justify-center gap-4 overflow-hidden bg-[#101016] p-4"
        style={{ clipPath: CARD_CLIP_PATH }}
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
  );
}
