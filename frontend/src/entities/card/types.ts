export type CardEffectType = 'MR_KEY_CHANGE' | 'MR_TEMPO_CHANGE' | 'MIC_OPEN' | 'LYRICS_HIDE';

export type CardEffectTargetType = 'PERFORMER' | 'CARD_OWNER';

/** 카드 등급. S=실버(10초) / G=골드(15초) / P=플래티넘(20초) */
export type CardTier = 'S' | 'G' | 'P';

export type CardAssignmentStatus = 'ASSIGNED' | 'PENDING' | 'USED';

export type CardEffectEndReason =
  | 'DURATION_EXPIRED'
  | 'PERFORMANCE_ENDED'
  | 'ROOM_TERMINATED'
  | 'PERFORMANCE_CANCELLED'
  | 'SYSTEM_CANCELLED';

/**
 * 내가 배정받은 카드. CARD_ASSIGNED 수신 또는 방 스냅샷 복원으로 채워진다.
 * 스냅샷에는 이름/설명이 없어 null일 수 있다 — 렌더링 시 효과별 폴백 문구를 쓴다.
 */
export interface AssignedCard {
  cardCode: string;
  cardId: number;
  cardName: string | null;
  description: string | null;
  durationSeconds: number;
  effectType: CardEffectType;
  effectValue: number | null;
  participantId: number;
  performanceId: number;
  targetType: CardEffectTargetType;
  tier: CardTier | null;
}

export function cardTierFromDuration(durationSeconds: number | null | undefined): CardTier | null {
  switch (durationSeconds) {
    case 10:
      return 'S';
    case 15:
      return 'G';
    case 20:
      return 'P';
    default:
      return null;
  }
}
