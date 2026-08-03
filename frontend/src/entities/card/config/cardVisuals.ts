import type { CardEffectTargetType, CardEffectType, CardTier } from '../types';

/** 카드 공통 코너 컷 프레임 (양 모서리 잘린 팔각 실루엣) */
export const CARD_CLIP_PATH =
  'polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px)';

interface CardEffectVisual {
  /** 상단 우측 카테고리 라벨 */
  categoryLabel: string;
  /** 서버 description이 없을 때 쓰는 기본 효과 설명 */
  fallbackDescription: string;
  /** 카드 중앙 영문 타이틀 */
  title: string;
}

export const CARD_EFFECT_VISUALS: Record<CardEffectType, CardEffectVisual> = {
  MR_KEY_CHANGE: {
    categoryLabel: 'PITCH CHANGE',
    fallbackDescription: '가창자의 음정을 강제로 변경합니다.',
    title: 'PITCH HACKING',
  },
  MR_TEMPO_CHANGE: {
    categoryLabel: 'TEMPO CHANGE',
    fallbackDescription: '가창자의 템포를 강제로 변경합니다.',
    title: 'TEMPO HACKING',
  },
  MIC_OPEN: {
    categoryLabel: 'STEEL MIC',
    fallbackDescription: '마이크를 개방하여 가창 중인 무대에 난입합니다.',
    title: 'MIC HIJACKING',
  },
  LYRICS_HIDE: {
    categoryLabel: 'LYRICS HIDING',
    fallbackDescription: '가창자의 시선에서 가사가 가려집니다.',
    title: 'LYRICS BLACKOUT',
  },
};

interface CardTierVisual {
  /** 카드 테두리 그라데이션 (CSS background) */
  frameGradient: string;
  /** 카드 외곽 글로우 (CSS box-shadow) */
  glow: string;
  /** 아이콘 링/포인트 컬러 */
  iconColor: string;
  /** SVG 아이콘용 홀로그램 그라데이션 스톱 (플래티넘 전용) */
  iconGradientStops?: string[];
  label: string;
}

export const CARD_TIER_VISUALS: Record<CardTier, CardTierVisual> = {
  S: {
    frameGradient: 'linear-gradient(160deg, #f4f4f5 0%, #71717a 45%, #d4d4d8 70%, #52525b 100%)',
    glow: '0 0 18px rgb(212 212 216 / 25%)',
    iconColor: '#e4e4e7',
    label: 'SILVER',
  },
  G: {
    frameGradient: 'linear-gradient(160deg, #fef08a 0%, #eab308 45%, #fde047 70%, #a16207 100%)',
    glow: '0 0 18px rgb(234 179 8 / 30%)',
    iconColor: '#fde047',
    label: 'GOLD',
  },
  P: {
    frameGradient:
      'linear-gradient(160deg, #67e8f9 0%, #a78bfa 30%, #f9a8d4 55%, #fde68a 78%, #6ee7b7 100%)',
    glow: '0 0 22px rgb(167 139 250 / 35%)',
    iconColor: '#a5f3fc',
    iconGradientStops: ['#67e8f9', '#a78bfa', '#f9a8d4', '#fde68a', '#6ee7b7'],
    label: 'PLATINUM',
  },
};

export const CARD_TARGET_LABELS: Record<CardEffectTargetType, string> = {
  PERFORMER: 'DEFENDER',
  CARD_OWNER: 'CARD OWNER',
};

/** 키/템포 카드의 수치 표기 (+4, -5). 수치 없는 카드는 null */
export function formatCardEffectValue(
  effectType: CardEffectType,
  effectValue: number | null | undefined,
): string | null {
  if (effectValue == null) {
    return null;
  }
  if (effectType !== 'MR_KEY_CHANGE' && effectType !== 'MR_TEMPO_CHANGE') {
    return null;
  }
  return effectValue > 0 ? `+${effectValue}` : `${effectValue}`;
}
