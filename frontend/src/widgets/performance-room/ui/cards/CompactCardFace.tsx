import {
  CARD_ASPECT,
  CARD_EFFECT_VISUALS,
  CARD_RADIUS,
  CARD_TIER_VISUALS,
  CardEffectIcon,
  formatCardEffectValue,
  type CardEffectType,
  type CardTier,
} from '@/entities/card';
import { cn } from '@/shared/lib/cn';

import { CardSheen } from './CardSheen';

interface CompactCardFaceProps {
  className?: string;
  effectType: CardEffectType;
  effectValue?: number | null;
  tier: CardTier;
  /** true면 사용 완료 — 색을 빼서 남은 카드와 구분한다 */
  used?: boolean;
}

/** 등급별 광택 스윕 색. 프레임 금속색과 같은 계열이라야 같은 재질로 보인다 */
const TIER_SHEEN: Record<CardTier, string> = {
  S: 'rgb(244 244 245 / 55%)',
  G: 'rgb(254 240 138 / 60%)',
  P: 'rgb(167 139 250 / 55%)',
};

/**
 * 좁은 자리(캠 레일·타일)용 카드 앞면. 정식 앞면의 설명·타깃·지속시간은 덜어내고
 * 등급 프레임 / 효과 아이콘 / 이름만 남긴다 — 작아도 무슨 카드인지와 등급이 읽힌다.
 * 모든 치수는 컨테이너 폭 비례(cqw)라 카드가 커지고 작아져도 비율이 유지된다.
 */
export function CompactCardFace({
  className,
  effectType,
  effectValue,
  tier,
  used = false,
}: CompactCardFaceProps) {
  const effect = CARD_EFFECT_VISUALS[effectType];
  const tierVisual = CARD_TIER_VISUALS[tier];
  const valueLabel = formatCardEffectValue(effectType, effectValue);

  return (
    <div
      className={cn('relative select-none overflow-hidden', used && 'opacity-60 grayscale', className)}
      style={{
        aspectRatio: CARD_ASPECT,
        borderRadius: CARD_RADIUS,
        background: tierVisual.frameGradient,
        boxShadow: tierVisual.glow,
        containerType: 'inline-size',
      }}
    >
      {/*
        프레임 두께는 안쪽 면의 inset으로 준다 — cqw는 컨테이너 자신에게는 뷰포트 기준으로
        풀려서(자기 참조 금지) 바깥 padding에 쓰면 화면 크기만큼 두꺼워진다.
      */}
      <div
        className="absolute flex flex-col items-center justify-center bg-[#101016]"
        style={{ inset: '2.5cqw', borderRadius: CARD_RADIUS, gap: '6cqw', padding: '6cqw 4cqw' }}
      >
        <p
          className="font-mono tracking-[0.12em]"
          style={{ fontSize: '7cqw', color: tierVisual.iconColor }}
        >
          {tierVisual.label}
        </p>

        <div className="rounded-full" style={{ background: tierVisual.frameGradient, padding: '1cqw' }}>
          <div
            className="grid place-items-center rounded-full bg-[#101016]"
            style={{ color: tierVisual.iconColor, width: '34cqw', height: '34cqw' }}
          >
            <div style={{ width: '18cqw', height: '18cqw' }}>
              <CardEffectIcon
                effectType={effectType}
                gradientStops={tierVisual.iconGradientStops}
                className="size-full"
              />
            </div>
          </div>
        </div>

        <div className="text-center">
          <p
            className="font-sans font-black italic leading-tight tracking-[0.04em] text-white"
            style={{
              fontSize: '8.5cqw',
              textShadow: '0.5cqw 0 rgb(255 45 149 / 55%), -0.5cqw 0 rgb(34 211 238 / 55%)',
            }}
          >
            {effect.title}
          </p>
          {valueLabel !== null ? (
            <p className="font-mono font-bold text-white" style={{ fontSize: '10cqw' }}>
              {valueLabel}
            </p>
          ) : null}
        </div>
      </div>

      {/*
        카드 위를 훑고 지나가는 광택. 프레임과 같은 등급 색이라 실버·골드·플래티넘이
        각자의 금속으로 일렁인다. 면 위에 얹어야 카드 전체에 빛이 지나간다.
      */}
      {used ? null : <CardSheen color={TIER_SHEEN[tier]} />}
    </div>
  );
}
