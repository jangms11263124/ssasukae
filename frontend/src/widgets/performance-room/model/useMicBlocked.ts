'use client';

import { useRoomStore } from '@/entities/room';

import { useCardStore, type ActiveCardEffect } from './cardStore';
import { useStageStore, type StagePhase } from './stageStore';

interface MicBlockInput {
  phase: StagePhase;
  isSuspended: boolean;
  performerParticipantId: number | null;
  myParticipantId: number | null;
  activeEffect: ActiveCardEffect | null;
}

/**
 * 재생 중에는 가창자만 마이크를 쓴다 — 나머지 참가자는 마이크 토글 상태와 무관하게 송출이 막힌다.
 * 예외는 마이크 난입(MIC_OPEN) 효과 대상뿐이고, 효과가 끝나면(CARD_EFFECT_ENDED) 다시 막힌다.
 * 일반전·수성전 공통 규칙이라 모드는 보지 않는다 — 일반전에는 MIC_OPEN 자체가 없다.
 */
function computeMicBlocked({
  phase,
  isSuspended,
  performerParticipantId,
  myParticipantId,
  activeEffect,
}: MicBlockInput): boolean {
  if (phase !== 'PERFORMING') {
    return false;
  }

  // 가창자 연결 끊김으로 MR이 멈춘 동안은 가창을 방해할 게 없어 열어 둔다 — 재개되면 다시 막힌다.
  if (isSuspended) {
    return false;
  }

  // 가창자를 아직 모른다면(스냅샷 지연 등) 막지 않는다 — 가창자를 잘못 막는 쪽이 더 나쁘다.
  if (myParticipantId === null || performerParticipantId === null) {
    return false;
  }

  if (myParticipantId === performerParticipantId) {
    return false;
  }

  const hasMicOpenEffect =
    activeEffect !== null &&
    activeEffect.effectType === 'MIC_OPEN' &&
    activeEffect.targetParticipantId === myParticipantId;

  return !hasMicOpenEffect;
}

/** 렌더 밖(퍼블리셔 생성 시점 등)에서 지금 내 마이크가 막혀 있는지 읽는다 */
export function readMicBlocked(): boolean {
  const stage = useStageStore.getState();

  return computeMicBlocked({
    phase: stage.phase,
    isSuspended: stage.isSuspended,
    performerParticipantId: stage.performerParticipantId,
    myParticipantId: useRoomStore.getState().session?.myParticipantId ?? null,
    activeEffect: useCardStore.getState().activeEffect,
  });
}

/** 내 마이크가 공연 규칙으로 막혀 있는지. 송출 차단과 토글 잠금이 같은 값을 본다 */
export function useMicBlocked(): boolean {
  const phase = useStageStore((state) => state.phase);
  const isSuspended = useStageStore((state) => state.isSuspended);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const myParticipantId = useRoomStore((state) => state.session?.myParticipantId ?? null);
  const activeEffect = useCardStore((state) => state.activeEffect);

  return computeMicBlocked({
    phase,
    isSuspended,
    performerParticipantId,
    myParticipantId,
    activeEffect,
  });
}
