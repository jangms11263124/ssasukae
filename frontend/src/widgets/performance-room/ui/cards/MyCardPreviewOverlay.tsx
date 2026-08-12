'use client';

import { AttackCardFront, CARD_EFFECT_VISUALS, cardTierFromDuration } from '@/entities/card';
import { cn } from '@/shared/lib/cn';

import { useCardStore } from '../../model/cardStore';
import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageStore } from '../../model/stageStore';
import { resolveCardActionLabel } from './cardActionLabels';
import { CardPreviewOverlay } from './CardPreviewOverlay';
import { UsedStamp } from './UsedStamp';

/**
 * 내 공격 카드 확인 오버레이. 앞면을 크게 띄우고 그 자리에서 사용까지 확정한다 —
 * 레일 카드와 내 캠 옆 카드가 같은 화면을 공유한다.
 */
export function MyCardPreviewOverlay({ onClose }: { onClose: () => void }) {
  const myCard = useCardStore((state) => state.myCard);
  const myCardStatus = useCardStore((state) => state.myCardStatus);
  const pendingActivation = useCardStore((state) => state.pendingActivation);
  const activeEffect = useCardStore((state) => state.activeEffect);
  const phase = useStageStore((state) => state.phase);
  const socket = useRoomSocketContext();

  if (myCard === null) {
    return null;
  }

  const roomCardBusy = pendingActivation !== null || activeEffect !== null;
  const isUsed = myCardStatus === 'USED';
  const canUse = myCardStatus === 'ASSIGNED' && phase === 'PERFORMING' && !roomCardBusy;
  const tier = myCard.tier ?? cardTierFromDuration(myCard.durationSeconds) ?? 'S';
  const cardTitle = myCard.cardName ?? CARD_EFFECT_VISUALS[myCard.effectType].title;
  const actionLabel = resolveCardActionLabel(myCardStatus, phase, roomCardBusy);

  const handleActivate = () => {
    if (!canUse) return;
    socket.sendCardActivate();
    onClose();
  };

  return (
    <CardPreviewOverlay
      ariaLabel={`${cardTitle} 카드 확인`}
      onClose={onClose}
      actions={
        <>
          <button
            type="button"
            disabled={!canUse}
            onClick={handleActivate}
            className={cn(
              'min-h-10 min-w-40 px-5 font-mono text-xs tracking-[0.12em] transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
              canUse
                ? 'border border-cyan-300/70 bg-cyan-950/40 text-cyan-200 hover:border-cyan-200 hover:bg-cyan-900/40'
                : 'cursor-not-allowed border border-white/10 bg-white/5 text-zinc-600',
            )}
          >
            {actionLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 border border-white/25 bg-black/40 px-5 font-mono text-xs tracking-[0.12em] text-zinc-400 transition-colors hover:border-white/50 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
          >
            닫기
          </button>
        </>
      }
    >
      {/* 도장의 cqw가 카드 폭을 참조하도록 래퍼가 컨테이너가 된다 */}
      <div
        className="relative w-[min(82vw,18rem)]"
        style={{ containerType: 'inline-size' }}
      >
        <AttackCardFront
          className={cn('w-full', isUsed && 'opacity-70 grayscale')}
          cardCode={myCard.cardCode}
          description={myCard.description ?? undefined}
          durationSeconds={myCard.durationSeconds}
          effectType={myCard.effectType}
          effectValue={myCard.effectValue}
          targetType={myCard.targetType}
          tier={tier}
        />
        {isUsed ? <UsedStamp /> : null}
      </div>
    </CardPreviewOverlay>
  );
}
