import { create } from 'zustand';

import {
  cardTierFromDuration,
  type AssignedCard,
  type CardActivationCancelledPayload,
  type CardActivationScheduledPayload,
  type CardAssignmentStatus,
  type CardEffectEndedPayload,
  type CardEffectStartedPayload,
  type CardEffectTargetType,
  type CardEffectType,
} from '@/entities/card';
import {
  useRoomStore,
  type RoomSnapshotActiveCard,
  type RoomSnapshotCardUsageStatus,
  type RoomSnapshotMyCard,
  type RoomSnapshotResponse,
} from '@/entities/room';

/** 다른 참가자의 카드 보유 상태 (본인 카드 내용은 개인 큐로만 와서 보유 여부만 안다) */
export type ParticipantCardState = 'ASSIGNED' | 'USED';

/** CARD_ACTIVATION_SCHEDULED로 시작되는 3초 카운트다운 상태. 카드 정체는 아직 비공개다 */
export interface PendingCardActivation {
  activateAt: string;
  countdownSeconds: number;
  performanceId: number;
  sourceParticipantId: number;
}

/**
 * 현재 적용 중인 카드 효과. CARD_EFFECT_STARTED 이벤트 또는 재접속 스냅샷으로 채워진다.
 * 스냅샷에는 카드 이름/설명/ID가 없어 null일 수 있다 — 렌더링은 effectType 폴백을 쓴다.
 */
export interface ActiveCardEffect {
  cardCode: string | null;
  cardId: number | null;
  cardName: string | null;
  description: string | null;
  effectType: CardEffectType;
  effectValue: number | null;
  endsAt: string;
  performanceId: number;
  sourceParticipantId: number;
  startedAt: string | null;
  targetParticipantId: number;
  targetType: CardEffectTargetType;
}

/** 카드 효과 1건을 식별하는 키. 컷인·무대 셰이크가 "새로 시작된 효과"를 같은 기준으로 판별한다 */
export function cardEffectKey(effect: ActiveCardEffect): string {
  return `${effect.performanceId}:${effect.sourceParticipantId}:${effect.startedAt ?? ''}`;
}

interface CardStore {
  /** 내가 배정받은 카드. 가창자이거나 아직 배정 전이면 null */
  myCard: AssignedCard | null;
  myCardStatus: CardAssignmentStatus | null;
  /** participantId → 카드 보유 상태. PLAYBACK_STARTED 시점의 공격자 전원을 ASSIGNED로 시드한다 */
  cardHolders: Record<number, ParticipantCardState>;
  /** 카드 배분 연출 오버레이 노출 여부 */
  dealOverlayOpen: boolean;
  /** 서버 시각 - 로컬 시각(ms). 카운트다운·남은 시간 계산에 사용한다 */
  clockOffsetMs: number;
  /** 발동 대기(3초 카운트다운) 중인 카드. 방 전체에 하나만 존재한다 */
  pendingActivation: PendingCardActivation | null;
  /** 현재 적용 중인 카드 효과. CARD_EFFECT_ENDED가 유일한 종료 기준이다 */
  activeEffect: ActiveCardEffect | null;

  /** 노래 시작 시점: 가창자를 제외한 온라인 참가자 전원을 카드 보유 상태로 표시 */
  seedCardHolders: (participantIds: number[]) => void;
  /** CARD_ASSIGNED 수신: 내 카드 저장 + 배분 연출 열기 */
  applyCardAssigned: (card: AssignedCard) => void;
  dismissDealOverlay: () => void;
  /** 서버 이벤트의 serverNow 기준으로 시계 오프셋을 갱신 */
  setClockOffset: (offsetMs: number) => void;
  /** CARD_ACTIVATION_SCHEDULED: 3초 카운트다운 시작. 사용자 카드는 PENDING으로 */
  applyActivationScheduled: (payload: CardActivationScheduledPayload) => void;
  /** CARD_ACTIVATION_CANCELLED: 카운트다운 해제 + 사용자 카드 ASSIGNED 복구 */
  applyActivationCancelled: (payload: CardActivationCancelledPayload) => void;
  /** CARD_EFFECT_STARTED: 카드 공개 + 효과 적용 시작 + 사용자 카드 USED */
  applyEffectStarted: (payload: CardEffectStartedPayload) => void;
  /** CARD_EFFECT_ENDED: 효과 해제 */
  applyEffectEnded: (payload: CardEffectEndedPayload) => void;
  /** 공연 종료/취소: 카드는 공연 단위라 전부 초기화 */
  resetCards: () => void;
  /** 방 스냅샷 기준으로 카드 상태 복원 (새로고침/중간입장). 배분 연출은 다시 열지 않는다 */
  hydrateFromSnapshot: (input: {
    myCard: RoomSnapshotMyCard | null;
    cardUsageStatuses: RoomSnapshotCardUsageStatus[];
    activeCard: RoomSnapshotActiveCard | null;
    myParticipantId: number;
  }) => void;
}

const INITIAL_CARD_STATE = {
  myCard: null,
  myCardStatus: null,
  cardHolders: {},
  dealOverlayOpen: false,
  pendingActivation: null,
  activeEffect: null,
} satisfies Pick<
  CardStore,
  'myCard' | 'myCardStatus' | 'cardHolders' | 'dealOverlayOpen' | 'pendingActivation' | 'activeEffect'
>;

export const useCardStore = create<CardStore>((set) => ({
  ...INITIAL_CARD_STATE,
  clockOffsetMs: 0,

  seedCardHolders: (participantIds) =>
    set({
      cardHolders: Object.fromEntries(participantIds.map((id) => [id, 'ASSIGNED' as const])),
    }),

  applyCardAssigned: (card) =>
    set({ myCard: card, myCardStatus: 'ASSIGNED', dealOverlayOpen: true }),

  dismissDealOverlay: () => set({ dealOverlayOpen: false }),

  setClockOffset: (offsetMs) => set({ clockOffsetMs: offsetMs }),

  applyActivationScheduled: (payload) =>
    set((state) => ({
      pendingActivation: {
        activateAt: payload.activateAt,
        countdownSeconds: payload.countdownSeconds,
        performanceId: payload.performanceId,
        sourceParticipantId: payload.sourceParticipantId,
      },
      myCardStatus:
        state.myCard !== null && state.myCard.participantId === payload.sourceParticipantId
          ? 'PENDING'
          : state.myCardStatus,
    })),

  applyActivationCancelled: (payload) =>
    set((state) => ({
      pendingActivation:
        state.pendingActivation?.sourceParticipantId === payload.sourceParticipantId
          ? null
          : state.pendingActivation,
      cardHolders: { ...state.cardHolders, [payload.sourceParticipantId]: 'ASSIGNED' },
      myCardStatus:
        state.myCard !== null && state.myCard.participantId === payload.sourceParticipantId
          ? 'ASSIGNED'
          : state.myCardStatus,
    })),

  applyEffectStarted: (payload) =>
    set((state) => ({
      pendingActivation: null,
      activeEffect: {
        cardCode: payload.cardCode,
        cardId: payload.cardId,
        cardName: payload.cardName,
        description: payload.description,
        effectType: payload.effectType,
        effectValue: payload.effectValue,
        endsAt: payload.endsAt,
        performanceId: payload.performanceId,
        sourceParticipantId: payload.sourceParticipantId,
        startedAt: payload.startedAt,
        targetParticipantId: payload.targetParticipantId,
        targetType: payload.targetType,
      },
      cardHolders: { ...state.cardHolders, [payload.sourceParticipantId]: 'USED' },
      myCardStatus:
        state.myCard !== null && state.myCard.participantId === payload.sourceParticipantId
          ? 'USED'
          : state.myCardStatus,
    })),

  applyEffectEnded: (payload) =>
    set((state) => ({
      // 카드는 공연당 1인 1장이므로 (공연, 사용자) 조합이 카드 사용 건을 유일하게 식별한다.
      // 스냅샷 복원 효과에는 cardId가 없어 cardId 대신 이 조합으로 대조한다.
      activeEffect:
        state.activeEffect !== null &&
        state.activeEffect.performanceId === payload.performanceId &&
        state.activeEffect.sourceParticipantId === payload.sourceParticipantId
          ? null
          : state.activeEffect,
    })),

  resetCards: () => set(INITIAL_CARD_STATE),

  hydrateFromSnapshot: ({ myCard, cardUsageStatuses, activeCard, myParticipantId }) =>
    set((state) => ({
      // 발동 대기/적용 중 카드 복원. IDLE이거나 필요한 시각 정보가 없으면 없는 것으로 본다.
      pendingActivation:
        activeCard !== null && activeCard.roomCardStatus === 'PENDING' && activeCard.activateAt !== null
          ? {
              activateAt: activeCard.activateAt,
              countdownSeconds: 3,
              performanceId: activeCard.performanceId,
              sourceParticipantId: activeCard.sourceParticipantId,
            }
          : null,
      activeEffect:
        activeCard !== null && activeCard.roomCardStatus === 'ACTIVE' && activeCard.endsAt !== null
          ? {
              // 스냅샷에는 카드 이름/설명/ID가 없다. 렌더링은 effectType 폴백을 쓴다.
              cardCode: null,
              cardId: null,
              cardName: null,
              description: null,
              effectType: activeCard.effectType,
              effectValue: activeCard.effectValue,
              endsAt: activeCard.endsAt,
              performanceId: activeCard.performanceId,
              sourceParticipantId: activeCard.sourceParticipantId,
              startedAt: activeCard.startedAt,
              targetParticipantId: activeCard.targetParticipantId,
              targetType: activeCard.effectType === 'MIC_OPEN' ? 'CARD_OWNER' : 'PERFORMER',
            }
          : null,
      cardHolders: Object.fromEntries(
        cardUsageStatuses.map((usage) => [
          usage.participantId,
          // PENDING(발동 대기)도 아직 효과 시작 전이므로 보유 상태로 표시한다.
          usage.status === 'USED' ? ('USED' as const) : ('ASSIGNED' as const),
        ]),
      ),
      myCard:
        myCard === null
          ? null
          : {
              cardCode: myCard.cardCode,
              cardId: myCard.cardId,
              // 스냅샷에는 카드 이름/설명이 없다. 렌더링은 효과별 폴백 문구를 쓴다.
              cardName: null,
              description: null,
              durationSeconds: myCard.durationSeconds,
              effectType: myCard.effectType,
              effectValue: myCard.effectValue,
              participantId: myParticipantId,
              performanceId: myCard.performanceId,
              // 효과 대상은 카드 종류로 정해진다 (MIC_OPEN만 사용자 본인)
              targetType: myCard.effectType === 'MIC_OPEN' ? 'CARD_OWNER' : 'PERFORMER',
              tier: cardTierFromDuration(myCard.durationSeconds),
            },
      myCardStatus: myCard?.status ?? null,
      dealOverlayOpen: myCard === null ? false : state.dealOverlayOpen,
    })),
}));

/** 방 스냅샷 응답에서 카드 상태를 복원한다. 방 세션이 없으면 아무것도 하지 않는다 */
export function hydrateCardsFromRoomSnapshot(snapshot: RoomSnapshotResponse) {
  const cardStore = useCardStore.getState();
  const myParticipantId = useRoomStore.getState().session?.myParticipantId;

  if (myParticipantId === undefined) {
    return;
  }

  // 재접속 직후에는 아직 카드 이벤트를 받은 적이 없어 스냅샷이 유일한 시계 기준이다.
  if (snapshot.serverNow !== undefined) {
    cardStore.setClockOffset(new Date(snapshot.serverNow).getTime() - Date.now());
  }

  cardStore.hydrateFromSnapshot({
    myCard: snapshot.myCard ?? null,
    cardUsageStatuses: snapshot.cardUsageStatuses ?? [],
    activeCard: snapshot.activeCard ?? null,
    myParticipantId,
  });
}
