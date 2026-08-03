'use client';

import { CARD_EFFECT_VISUALS } from '@/entities/card';
import { useRoomStore } from '@/entities/room';

import { useCardStore } from '../../model/cardStore';
import { useRemainingSeconds } from '../../model/useRemainingSeconds';

function formatRemaining(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** 효과 발동 중 가창자 캠 우측 상단에 표시하는 공격 정보 배너 (공격자 > 대상 / 카드명 / 남은 시간) */
export function ActiveEffectBanner() {
  const activeEffect = useCardStore((state) => state.activeEffect);
  const participants = useRoomStore((state) => state.participants);
  const remainingSeconds = useRemainingSeconds(activeEffect?.endsAt ?? null);

  if (activeEffect === null) {
    return null;
  }

  const nicknameOf = (participantId: number) =>
    participants.find(({ id }) => id === participantId)?.nickname ?? '???';

  const cardTitle = activeEffect.cardName ?? CARD_EFFECT_VISUALS[activeEffect.effectType].title;

  return (
    <div className="absolute right-4 top-4 z-20 border border-cyan-300/70 bg-black/85 px-4 py-3 backdrop-blur-sm">
      <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-cyan-300">
        <MicSparkIcon />
        ATTACK CARD ACTIVATED
      </p>
      <p className="mt-2 text-center font-mono text-xs text-zinc-300">
        {nicknameOf(activeEffect.sourceParticipantId)}
        <span className="px-1.5 text-zinc-500">&gt;</span>
        {nicknameOf(activeEffect.targetParticipantId)}
      </p>
      <p className="mt-1 text-center text-sm font-black uppercase italic tracking-[0.04em] text-white">
        {cardTitle}
      </p>
      <p className="mt-2 flex items-center justify-center gap-1.5 font-mono text-xs text-zinc-200">
        <span aria-hidden="true" className="size-1.5 animate-pulse bg-red-500" />
        REMAINING: {formatRemaining(remainingSeconds)}
      </p>
    </div>
  );
}

function MicSparkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="size-3.5"
    >
      <path d="M8 4v8M12 2v12M16 5v6" />
      <path d="M6 18h12" />
    </svg>
  );
}
