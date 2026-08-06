'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  AttackCardBack,
  AttackCardDealFlip,
  AttackCardFront,
  CARD_TIER_VISUALS,
  cardTierFromDuration,
  type AssignedCard,
  type CardTier,
} from '@/entities/card';
import { cn } from '@/shared/lib/cn';

import { useCardStore } from '../../model/cardStore';

/** 확정 퇴장 + 흑백 해제 — CSS --overlay-confirm-exit-duration / backdrop-release 와 맞출 것 */
const CONFIRM_EXIT_MS: Record<CardTier, number> = {
  S: 1900,
  G: 1900,
  P: 2100,
};

const TIER_ASSIGN_LABEL: Record<CardTier, string> = {
  S: 'SILVER CARD ASSIGNED',
  G: 'GOLD CARD ASSIGNED',
  P: 'PLATINUM CARD ASSIGNED',
};

interface CardDealContentProps {
  card: AssignedCard;
  onConfirm: () => void;
}

function CardDealContent({ card, onConfirm }: CardDealContentProps) {
  const [revealed, setRevealed] = useState(false);
  const [landed, setLanded] = useState(false);
  const [flipSettled, setFlipSettled] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const tier = card.tier ?? cardTierFromDuration(card.durationSeconds) ?? 'S';
  const tierLabel = CARD_TIER_VISUALS[tier].label;

  useEffect(() => {
    if (!confirming) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      onConfirm();
      return;
    }

    const timer = window.setTimeout(() => onConfirm(), CONFIRM_EXIT_MS[tier]);
    return () => window.clearTimeout(timer);
  }, [confirming, onConfirm, tier]);

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5',
        'attack-card-deal-overlay',
        `attack-card-deal-overlay--${tier}`,
        'is-entering',
        landed && 'is-landed',
        revealed && !flipSettled && 'is-card-flipping',
        flipSettled && 'is-revealed-fx',
        confirming && 'is-confirming',
      )}
      role="dialog"
      aria-label={`${tierLabel} 공격 카드 배정`}
    >
      <div className="attack-card-deal-overlay__backdrop" aria-hidden />
      <div className="attack-card-deal-overlay__broadcast" aria-hidden />
      <div className="attack-card-deal-overlay__release" aria-hidden />
      <div className="attack-card-deal-overlay__hud" aria-hidden />
      <div className="attack-card-deal-overlay__spotlight" aria-hidden />
      <div className="attack-card-deal-overlay__impact" aria-hidden />
      {tier !== 'S' ? <div className="attack-card-deal-overlay__scan" aria-hidden /> : null}

      <p
        className={cn(
          'relative z-[1] font-mono text-[11px] tracking-[0.3em] transition-opacity duration-300',
          'attack-card-deal-overlay__title',
          confirming && 'opacity-0',
        )}
      >
        {TIER_ASSIGN_LABEL[tier]}
      </p>

      <div className="relative z-[1]">
        <AttackCardDealFlip
          className="w-[min(82vw,20rem)]"
          revealed={revealed}
          confirming={confirming}
          tier={tier}
          onReady={() => setLanded(true)}
          onReveal={() => setRevealed(true)}
          onFlipSettled={() => setFlipSettled(true)}
          onConfirm={() => setConfirming(true)}
          back={<AttackCardBack className="w-full" interactive={false} showFrameGlow={false} tier={tier} />}
          front={
            <AttackCardFront
              className="w-full"
              interactive={false}
              showFrameGlow={false}
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
      </div>

      <p
        className={cn(
          'relative z-[1] max-w-[20rem] text-center text-[13px] leading-relaxed tracking-tight text-zinc-300 transition-opacity duration-300',
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
 * 등급(S/G/P)에 따라 오버레이·글로우·스핀 강도가 달라진다.
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
