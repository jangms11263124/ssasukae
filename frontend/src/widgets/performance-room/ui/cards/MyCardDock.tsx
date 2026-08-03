'use client';

import { useState } from 'react';

import { AttackCardFront, CARD_EFFECT_VISUALS, cardTierFromDuration } from '@/entities/card';
import { cn } from '@/shared/lib/cn';

import { useCardStore } from '../../model/cardStore';
import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageStore } from '../../model/stageStore';

/**
 * 내 공격 카드 독. 공연 중 카드를 확인하고 발동한다.
 * 방 전체에 카드가 하나라도 대기/발동 중이면 사용할 수 없다.
 */
export function MyCardDock() {
  const myCard = useCardStore((state) => state.myCard);
  const myCardStatus = useCardStore((state) => state.myCardStatus);
  const pendingActivation = useCardStore((state) => state.pendingActivation);
  const activeEffect = useCardStore((state) => state.activeEffect);
  const phase = useStageStore((state) => state.phase);
  const socket = useRoomSocketContext();

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  if (myCard === null) {
    return null;
  }

  const roomCardBusy = pendingActivation !== null || activeEffect !== null;
  const canUse = myCardStatus === 'ASSIGNED' && phase === 'PERFORMING' && !roomCardBusy;
  const tier = myCard.tier ?? cardTierFromDuration(myCard.durationSeconds) ?? 'S';
  const cardTitle = myCard.cardName ?? CARD_EFFECT_VISUALS[myCard.effectType].title;

  const statusLabel =
    myCardStatus === 'USED'
      ? 'USED'
      : myCardStatus === 'PENDING'
        ? 'ACTIVATING...'
        : roomCardBusy
          ? 'WAIT'
          : 'READY';

  return (
    <div className="relative flex items-center gap-4 border border-white/10 bg-[#151517] px-5 py-3">
      {/* 호버 시 카드 앞면 미리보기 */}
      {isPreviewOpen ? (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2">
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
        </div>
      ) : null}

      <div
        className="min-w-0"
        onMouseEnter={() => setIsPreviewOpen(true)}
        onMouseLeave={() => setIsPreviewOpen(false)}
      >
        <p className="font-mono text-[9px] tracking-[0.2em] text-zinc-500">
          MY CARD :: {statusLabel}
        </p>
        <p
          className={cn(
            'mt-1 truncate text-sm font-black uppercase italic',
            myCardStatus === 'USED' ? 'text-zinc-500' : 'text-white',
          )}
        >
          {cardTitle}
        </p>
      </div>

      <button
        type="button"
        disabled={!canUse}
        onClick={socket.sendCardActivate}
        className={cn(
          'min-h-9 shrink-0 px-4 font-mono text-[11px] tracking-[0.12em] transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
          canUse
            ? 'border border-cyan-300/70 bg-cyan-950/40 text-cyan-200 hover:border-cyan-200 hover:bg-cyan-900/40'
            : 'cursor-not-allowed border border-white/10 bg-white/5 text-zinc-600',
        )}
      >
        {myCardStatus === 'USED' ? 'USED' : 'ACTIVATE'}
      </button>
    </div>
  );
}
