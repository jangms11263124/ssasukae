import type {
  CardEffectEndReason,
  CardEffectTargetType,
  CardEffectType,
  CardTier,
} from './types';

// ── 카드 WebSocket 이벤트 payload ──────────────────────────

/** CARD_ASSIGNED — /user/queue/cards 개인 전송 */
export interface CardAssignedPayload {
  cardCode: string;
  cardId: number;
  cardName: string;
  description: string;
  durationSeconds: number;
  effectType: CardEffectType;
  effectValue: number | null;
  participantId: number;
  performanceId: number;
  targetType: CardEffectTargetType;
  tier: CardTier | null;
}

/**
 * CARD_ACTIVATION_SCHEDULED — /topic/rooms/{roomId} 브로드캐스트.
 * 카운트다운 동안에는 누가 썼는지만 공개되고, 카드 정체는 CARD_EFFECT_STARTED에서 공개된다.
 */
export interface CardActivationScheduledPayload {
  activateAt: string;
  approvedAt: string;
  countdownSeconds: number;
  performanceId: number;
  serverNow: string;
  sourceParticipantId: number;
}

/** CARD_ACTIVATION_CANCELLED — 카운트다운 중 취소. 사용자 카드는 ASSIGNED로 복구된다. */
export interface CardActivationCancelledPayload {
  cancelledAt: string;
  cancelReason: CardEffectEndReason;
  performanceId: number;
  sourceParticipantId: number;
}

/** CARD_EFFECT_STARTED — 효과 적용 시작. 이 시점에 카드 정보가 방 전체에 공개된다. */
export interface CardEffectStartedPayload {
  cardCode: string;
  cardId: number;
  cardName: string;
  description: string;
  durationSeconds: number;
  effectType: CardEffectType;
  effectValue: number | null;
  endsAt: string;
  performanceId: number;
  sourceParticipantId: number;
  startedAt: string;
  targetParticipantId: number;
  targetType: CardEffectTargetType;
}

/** CARD_EFFECT_ENDED — 효과 종료 확정(SSOT). restoredValue 기준으로 원상 복구한다. */
export interface CardEffectEndedPayload {
  cardCode: string;
  cardId: number;
  cardName: string;
  description: string;
  durationSeconds: number;
  effectType: CardEffectType;
  effectValue: number | null;
  endedAt: string;
  endReason: CardEffectEndReason;
  performanceId: number;
  restoredValue: number | null;
  sourceParticipantId: number;
  startedAt: string;
  targetParticipantId: number;
  targetType: CardEffectTargetType;
}
