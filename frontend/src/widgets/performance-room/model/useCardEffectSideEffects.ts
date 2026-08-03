'use client';

import { useEffect, useRef } from 'react';

import { useCardStore } from './cardStore';
import { useStageStore } from './stageStore';

/**
 * MIC_OPEN 카드 효과: 카드 사용자 본인의 마이크를 효과 시간 동안 강제 개방한다.
 * micOn은 OpenVidu publishAudio와 로컬 오디오 엔진을 함께 구동하므로 stageStore만 바꾸면 된다.
 * 효과가 끝나면(CARD_EFFECT_ENDED) 개방 전 마이크 상태로 되돌린다.
 */
export function useCardEffectSideEffects(myParticipantId: number | null) {
  const activeEffect = useCardStore((state) => state.activeEffect);
  const previousMicOnRef = useRef<boolean | null>(null);

  useEffect(() => {
    const stageStore = useStageStore.getState();
    const isMyMicOpenEffect =
      activeEffect !== null &&
      activeEffect.effectType === 'MIC_OPEN' &&
      activeEffect.targetParticipantId === myParticipantId;

    if (isMyMicOpenEffect && previousMicOnRef.current === null) {
      previousMicOnRef.current = stageStore.micOn;
      if (!stageStore.micOn) {
        stageStore.toggleMic();
      }
      return;
    }

    if (!isMyMicOpenEffect && previousMicOnRef.current !== null) {
      const previousMicOn = previousMicOnRef.current;
      previousMicOnRef.current = null;
      if (stageStore.micOn !== previousMicOn) {
        stageStore.toggleMic();
      }
    }
  }, [activeEffect, myParticipantId]);
}
