'use client';

import { useState } from 'react';

import {
  AttackCardBack,
  AttackCardFront,
  cardTierFromDuration,
  type AssignedCard,
} from '@/entities/card';

import { useCardStore } from '../../model/cardStore';

interface CardDealContentProps {
  card: AssignedCard;
  onConfirm: () => void;
}

function CardDealContent({ card, onConfirm }: CardDealContentProps) {
  const [revealed, setRevealed] = useState(false);
  const tier = card.tier ?? cardTierFromDuration(card.durationSeconds) ?? 'S';

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-label="공격 카드 배정"
    >
      <p className="font-mono text-[11px] tracking-[0.3em] text-cyan-300">ATTACK CARD ASSIGNED</p>

      {revealed ? (
        <AttackCardFront
          className="w-52"
          cardCode={card.cardCode}
          description={card.description ?? undefined}
          durationSeconds={card.durationSeconds}
          effectType={card.effectType}
          effectValue={card.effectValue}
          targetType={card.targetType}
          tier={tier}
        />
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          aria-label="카드 공개하기"
          className="transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
        >
          <AttackCardBack className="w-52" tier={tier} />
        </button>
      )}

      {revealed ? (
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-9 border border-white bg-white px-6 font-mono text-[11px] tracking-[0.12em] text-black transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          CONFIRM CARD
        </button>
      ) : (
        <p className="font-mono text-[10px] tracking-[0.16em] text-zinc-400">
          카드를 클릭해 확인하세요
        </p>
      )}
    </div>
  );
}

/**
 * 카드 배분 연출 오버레이. 노래 시작 시 CARD_ASSIGNED를 받으면 중앙 무대 위에
 * 뒷면 카드가 등장하고, 클릭으로 앞면을 공개한 뒤 확인하면 닫힌다.
 * TODO(플립 담당): 뒷면 → 앞면 전환을 3D 회전 애니메이션으로 교체
 */
export function CardDealOverlay() {
  const myCard = useCardStore((state) => state.myCard);
  const dealOverlayOpen = useCardStore((state) => state.dealOverlayOpen);
  const dismissDealOverlay = useCardStore((state) => state.dismissDealOverlay);

  if (!dealOverlayOpen || myCard === null) {
    return null;
  }

  return (
    <CardDealContent
      // 새 공연에서 카드를 다시 받으면 리마운트되어 공개 상태가 초기화된다.
      key={`${myCard.performanceId}-${myCard.cardId}`}
      card={myCard}
      onConfirm={dismissDealOverlay}
    />
  );
}
