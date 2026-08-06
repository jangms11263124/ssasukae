'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  AttackCardBack,
  AttackCardDealFlip,
  AttackCardFront,
  cardTierFromDuration,
  type AssignedCard,
} from '@/entities/card';
import { cn } from '@/shared/lib/cn';

import { useCardStore } from '../../model/cardStore';

/** 확정 퇴장 연출 길이 — CSS --attack-card-confirm-duration 과 맞출 것 */
const CONFIRM_EXIT_MS = 1000;

interface CardDealContentProps {
  card: AssignedCard;
  onConfirm: () => void;
}

function CardDealContent({ card, onConfirm }: CardDealContentProps) {
  const [revealed, setRevealed] = useState(false);
  const [landed, setLanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const tier = card.tier ?? cardTierFromDuration(card.durationSeconds) ?? 'S';

  useEffect(() => {
    if (!confirming) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      onConfirm();
      return;
    }

    const timer = window.setTimeout(() => onConfirm(), CONFIRM_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [confirming, onConfirm]);

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-black/80',
        'attack-card-deal-overlay',
        confirming && 'is-confirming',
      )}
      role="dialog"
      aria-label="공격 카드 배정"
    >
      <p
        className={cn(
          'font-mono text-[11px] tracking-[0.3em] text-cyan-300 transition-opacity duration-300',
          confirming && 'opacity-0',
        )}
      >
        ATTACK CARD ASSIGNED
      </p>

      <AttackCardDealFlip
        className="w-[min(82vw,20rem)]"
        revealed={revealed}
        confirming={confirming}
        onReady={() => setLanded(true)}
        onReveal={() => setRevealed(true)}
        onConfirm={() => setConfirming(true)}
        back={<AttackCardBack className="w-full" interactive={false} tier={tier} />}
        front={
          <AttackCardFront
            className="w-full"
            interactive={false}
            cardCode={card.cardCode}
            description={card.description ?? undefined}
            durationSeconds={card.durationSeconds}
            effectType={card.effectType}
            effectValue={card.effectValue}
            targetType={card.targetType}
            tier={tier}
          />
        }
      />

      <p
        className={cn(
          'max-w-[20rem] text-center text-[13px] leading-relaxed tracking-tight text-zinc-300 transition-opacity duration-300',
          confirming && 'opacity-0',
        )}
      >
        {!landed
          ? '카드를 준비하고 있습니다.'
          : revealed
            ? '확정하려면 다시 눌러 주세요.'
            : '카드를 눌러 확인해 주세요.'}
      </p>
    </div>,
    document.body,
  );
}

/**
 * 카드 배분 연출 오버레이.
 * CARD_ASSIGNED 수신 시 뷰포트 밖에서 날아와 착지 → 클릭으로 앞면 → 다시 클릭으로 확정.
 */
export function CardDealOverlay() {
  const myCard = useCardStore((state) => state.myCard);
  const dealOverlayOpen = useCardStore((state) => state.dealOverlayOpen);
  const dismissDealOverlay = useCardStore((state) => state.dismissDealOverlay);

  if (!dealOverlayOpen || myCard === null || typeof document === 'undefined') {
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
