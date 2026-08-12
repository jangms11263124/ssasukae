'use client';

import { useState } from 'react';

import { cardTierFromDuration } from '@/entities/card';

import { useCardStore, type ParticipantCardState } from '../../model/cardStore';
import { CompactCardFace } from './CompactCardFace';
import { MyCardPreviewOverlay } from './MyCardPreviewOverlay';
import { PeerCardPreviewOverlay } from './PeerCardPreviewOverlay';
import { UnknownCardFace } from './UnknownCardFace';

interface TileCardButtonProps {
  nickname: string;
  /** 카드 주인의 participantId — 발동으로 공개된 카드(revealedCards) 조회 키 */
  participantId: number;
  cardState: ParticipantCardState;
  isSelf: boolean;
}

/**
 * 캠 타일 왼편의 카드. 내 카드는 앞면(등급·효과)을, 남의 카드는 물음표 면을 보여주고,
 * 누르면 각각 크게 뜬다. 남의 카드도 사용된 뒤에는 발동으로 공개된 앞면(흑백+USED)이 된다.
 */
export function TileCardButton({ nickname, participantId, cardState, isSelf }: TileCardButtonProps) {
  const myCard = useCardStore((state) => state.myCard);
  const revealedCard = useCardStore((state) => state.revealedCards[participantId]);

  const [isOpen, setIsOpen] = useState(false);
  const isUsed = cardState === 'USED';
  const stateLabel = isUsed ? '사용 완료' : '보유 중';
  const close = () => setIsOpen(false);

  // 내 카드라도 내용(개인 큐)이 아직 안 왔으면 남의 카드처럼 물음표로 둔다.
  const showMyFront = isSelf && myCard !== null;
  // 발동 순간 방 전체에 공개된 카드 — 남의 것이라도 사용 후에는 앞면으로 보여준다.
  const peerRevealed = !isSelf && isUsed ? (revealedCard ?? null) : null;

  return (
    <>
      {isOpen ? (
        showMyFront ? (
          <MyCardPreviewOverlay onClose={close} />
        ) : (
          <PeerCardPreviewOverlay
            nickname={nickname}
            cardState={cardState}
            revealedCard={peerRevealed}
            onClose={close}
          />
        )
      ) : null}

      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={`${isSelf ? '내' : `${nickname}님의`} 공격 카드 (${stateLabel}) 크게 보기`}
        title={`${nickname} · ${stateLabel}`}
        onClick={() => setIsOpen((prev) => !prev)}
        className="group w-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        {showMyFront ? (
          <CompactCardFace
            className="w-full transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95"
            effectType={myCard.effectType}
            effectValue={myCard.effectValue}
            tier={myCard.tier ?? cardTierFromDuration(myCard.durationSeconds) ?? 'S'}
            used={isUsed}
          />
        ) : peerRevealed !== null ? (
          <CompactCardFace
            className="w-full transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95"
            effectType={peerRevealed.effectType}
            effectValue={peerRevealed.effectValue}
            tier={peerRevealed.tier ?? 'S'}
            used
          />
        ) : (
          <UnknownCardFace
            className="w-full transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95"
            used={isUsed}
          />
        )}
      </button>
    </>
  );
}
