'use client';

import { useCardStore } from '../../model/cardStore';
import { useNicknameOf } from '../../model/useNicknameOf';
import { useRemainingSeconds } from '../../model/useRemainingSeconds';

/**
 * 카드 발동 3초 카운트다운 티저. 누가 썼는지만 공개하고 카드 정체는
 * CARD_EFFECT_STARTED에서 공개된다. 노래는 계속 진행되므로 화면을 가리지 않는다.
 */
export function CardCountdownOverlay() {
  const pendingActivation = useCardStore((state) => state.pendingActivation);
  const nicknameOf = useNicknameOf();
  const remainingSeconds = useRemainingSeconds(pendingActivation?.activateAt ?? null);

  if (pendingActivation === null || remainingSeconds <= 0) {
    return null;
  }

  const sourceNickname = nicknameOf(pendingActivation.sourceParticipantId);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
      <div className="flex items-center gap-4 border border-red-500/60 bg-black/80 px-5 py-3 backdrop-blur-sm">
        <span aria-hidden="true" className="size-2 animate-pulse bg-red-500" />
        <div>
          <p className="font-mono text-[10px] tracking-[0.24em] text-red-400">ATTACK INCOMING</p>
          <p className="mt-0.5 text-sm font-bold text-white">
            {sourceNickname}님이 카드를 사용했습니다
          </p>
        </div>
        <p className="min-w-8 text-center font-mono text-3xl font-black text-red-400">
          {remainingSeconds}
        </p>
      </div>
    </div>
  );
}
