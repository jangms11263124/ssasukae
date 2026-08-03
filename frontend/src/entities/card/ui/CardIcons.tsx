import { useId } from 'react';

import type { CardEffectType } from '../types';

interface CardIconProps {
  className?: string;
  /** 지정하면 stroke에 SVG 그라데이션을 입힌다 (플래티넘 홀로그램용) */
  gradientStops?: string[];
}

function HoloGradientDefs({ id, stops }: { id: string; stops: string[] }) {
  return (
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">
        {stops.map((stopColor, index) => (
          <stop key={stopColor} offset={index / (stops.length - 1)} stopColor={stopColor} />
        ))}
      </linearGradient>
    </defs>
  );
}

const CARD_EFFECT_ICON_PATHS: Record<CardEffectType, React.ReactElement> = {
  MR_KEY_CHANGE: (
    <>
      <circle cx="8.5" cy="17" r="2.6" />
      <path d="M11.1 17V5.5l3.4 1.2" />
      <path d="M15.5 12.5 18 10l2.5 2.5" />
      <path d="M15.5 16 18 18.5 20.5 16" />
    </>
  ),
  MR_TEMPO_CHANGE: (
    <>
      <path d="M10 4h4l3.2 15H6.8L10 4Z" />
      <path d="M12 14 17 6.5" />
      <path d="M6.8 15.5h10.4" />
    </>
  ),
  MIC_OPEN: (
    <>
      <path d="M4 12h10" />
      <path d="m10.5 8.5 3.5 3.5-3.5 3.5" />
      <path d="M16 4.5h3.5v15H16" />
    </>
  ),
  LYRICS_HIDE: (
    <>
      <path d="M3 12s3.2-5.5 9-5.5 9 5.5 9 5.5-3.2 5.5-9 5.5S3 12 3 12Z" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M4.5 19.5 19.5 4.5" />
    </>
  ),
};

export function CardEffectIcon({
  effectType,
  className,
  gradientStops,
}: CardIconProps & { effectType: CardEffectType }) {
  const gradientId = useId();
  const strokeColor = gradientStops ? `url(#${gradientId})` : 'currentColor';

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke={strokeColor}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {gradientStops ? <HoloGradientDefs id={gradientId} stops={gradientStops} /> : null}
      {CARD_EFFECT_ICON_PATHS[effectType]}
    </svg>
  );
}

/** STAR 카드 로고 (육각 큐브) */
export function StarCubeIcon({ className, gradientStops }: CardIconProps) {
  const gradientId = useId();
  const strokeColor = gradientStops ? `url(#${gradientId})` : 'currentColor';

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke={strokeColor}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {gradientStops ? <HoloGradientDefs id={gradientId} stops={gradientStops} /> : null}
      <path d="M12 3 19.5 7.5v9L12 21l-7.5-4.5v-9L12 3Z" />
      <path d="M12 21v-8.5" />
      <path d="M4.5 7.5 12 12.5l7.5-5" />
      <circle cx="12" cy="12.5" r="1.1" fill={strokeColor} stroke="none" />
    </svg>
  );
}
