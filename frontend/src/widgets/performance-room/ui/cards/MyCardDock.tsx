'use client';

import { useEffect, useState } from 'react';

import {
  AttackCardFront,
  CARD_EFFECT_VISUALS,
  cardTierFromDuration,
  HoloMiniCard,
} from '@/entities/card';
import { cn } from '@/shared/lib/cn';

import { useCardStore } from '../../model/cardStore';
import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageStore } from '../../model/stageStore';

/**
 * 내 공격 카드 독. 캠 하단의 카드를 누르면 앞면과 사용 버튼이 열린다.
 * 방 전체에 카드가 하나라도 대기/발동 중이면 사용할 수 없다.
 */
export function MyCardDock() {
  const myCard = useCardStore((state) => state.myCard);
  const myCardStatus = useCardStore((state) => state.myCardStatus);
  const pendingActivation = useCardStore((state) => state.pendingActivation);
  const activeEffect = useCardStore((state) => state.activeEffect);
  const phase = useStageStore((state) => state.phase);
  const socket = useRoomSocketContext();

  // 어느 카드로 열었는지를 기억한다 — 카드가 바뀌거나 회수되면 저절로 닫힌 상태가 된다.
  const [openCardKey, setOpenCardKey] = useState<string | null>(null);
  const cardKey = myCard === null ? null : `${myCard.performanceId}-${myCard.cardId}`;
  const isOpen = cardKey !== null && openCardKey === cardKey;

  const setIsOpen = (open: boolean) => setOpenCardKey(open ? cardKey : null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenCardKey(null);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (myCard === null) {
    return null;
  }

  const roomCardBusy = pendingActivation !== null || activeEffect !== null;
  const canUse = myCardStatus === 'ASSIGNED' && phase === 'PERFORMING' && !roomCardBusy;
  const tier = myCard.tier ?? cardTierFromDuration(myCard.durationSeconds) ?? 'S';
  const cardTitle = myCard.cardName ?? CARD_EFFECT_VISUALS[myCard.effectType].title;
  const isUsed = myCardStatus === 'USED';

  const statusLabel = isUsed
    ? 'USED'
    : myCardStatus === 'PENDING'
      ? 'ACTIVATING...'
      : roomCardBusy
        ? 'WAIT'
        : 'READY';

  // 사용할 수 없을 때는 버튼 라벨로 이유를 알려준다 — 눌러도 안 되는 이유가 보여야 한다.
  const actionLabel = isUsed
    ? '사용 완료'
    : myCardStatus === 'PENDING'
      ? '발동 중...'
      : phase !== 'PERFORMING'
        ? '공연 중에만 사용'
        : roomCardBusy
          ? '다른 카드 진행 중'
          : '사용하기';

  const handleActivate = () => {
    if (!canUse) return;
    socket.sendCardActivate();
    setIsOpen(false);
  };

  return (
    <div className="relative flex items-center gap-4 border border-white/10 bg-[#151517] px-5 py-3">
      {isOpen ? (
        <div className="absolute bottom-full left-0 z-30 mb-3 flex flex-col items-center gap-3 border border-white/10 bg-[#151517] p-3">
          <AttackCardFront
            className="w-48"
            cardCode={myCard.cardCode}
            description={myCard.description ?? undefined}
            durationSeconds={myCard.durationSeconds}
            effectType={myCard.effectType}
            effectValue={myCard.effectValue}
            targetType={myCard.targetType}
            tier={tier}
          />

          <button
            type="button"
            disabled={!canUse}
            onClick={handleActivate}
            className={cn(
              'min-h-9 w-full px-4 font-mono text-[11px] tracking-[0.12em] transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
              canUse
                ? 'border border-cyan-300/70 bg-cyan-950/40 text-cyan-200 hover:border-cyan-200 hover:bg-cyan-900/40'
                : 'cursor-not-allowed border border-white/10 bg-white/5 text-zinc-600',
            )}
          >
            {actionLabel}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={`내 공격 카드 ${cardTitle} 상세 열기`}
        onClick={() => setIsOpen(!isOpen)}
        className="flex shrink-0 items-center gap-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        <HoloMiniCard used={isUsed} />

        <span className="block min-w-0">
          <span className="block font-mono text-[9px] tracking-[0.2em] text-zinc-500">
            MY CARD :: {statusLabel}
          </span>
          <span
            className={cn(
              'mt-1 block truncate text-sm font-black uppercase italic',
              isUsed ? 'text-zinc-500' : 'text-white',
            )}
          >
            {cardTitle}
          </span>
          <span className="mt-0.5 block font-mono text-[9px] tracking-[0.14em] text-zinc-600">
            {isOpen ? '카드를 눌러 닫기' : '카드를 눌러 사용'}
          </span>
        </span>
      </button>
    </div>
  );
}
