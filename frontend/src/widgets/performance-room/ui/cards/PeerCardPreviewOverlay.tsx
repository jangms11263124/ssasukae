'use client';

import { AttackCardFront } from '@/entities/card';

import type { ParticipantCardState, RevealedUsedCard } from '../../model/cardStore';
import { CardPreviewOverlay } from './CardPreviewOverlay';
import { UnknownCardFace } from './UnknownCardFace';
import { UsedStamp } from './UsedStamp';

interface PeerCardPreviewOverlayProps {
  nickname: string;
  cardState: ParticipantCardState;
  /** 발동으로 공개된 카드. 있으면 물음표 대신 실제 앞면(흑백+USED)을 크게 보여준다 */
  revealedCard?: RevealedUsedCard | null;
  onClose: () => void;
}

/**
 * 다른 참가자의 카드 확인 오버레이. 카드 내용은 개인 큐로만 오므로 발동 전에는
 * 보유 여부만 안다 — 물음표 면으로 '무엇이 올지 모른다'를 보여주고,
 * 사용된 뒤에는 CARD_EFFECT_STARTED로 공개된 앞면을 흑백+USED로 보여준다.
 */
export function PeerCardPreviewOverlay({
  nickname,
  cardState,
  revealedCard,
  onClose,
}: PeerCardPreviewOverlayProps) {
  const isUsed = cardState === 'USED';
  const revealed = isUsed ? (revealedCard ?? null) : null;

  return (
    <CardPreviewOverlay
      ariaLabel={`${nickname}님의 공격 카드`}
      onClose={onClose}
      caption={
        isUsed ? (
          revealed !== null ? (
            `${nickname}님이 사용한 카드예요.`
          ) : (
            `${nickname}님은 카드를 이미 사용했어요.`
          )
        ) : (
          <>
            {nickname}님이 카드를 들고 있어요.
            <br />
            어떤 공격인지는 발동 전까지 알 수 없어요.
          </>
        )
      }
      actions={
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 min-w-40 border border-white/25 bg-black/40 px-5 font-mono text-xs tracking-[0.12em] text-zinc-400 transition-colors hover:border-white/50 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
        >
          닫기
        </button>
      }
    >
      {revealed !== null ? (
        // 도장의 cqw가 카드 폭을 참조하도록 래퍼가 컨테이너가 된다 (MyCardPreviewOverlay와 동일).
        <div
          className="relative w-[min(82vw,18rem)]"
          style={{ containerType: 'inline-size' }}
        >
          <AttackCardFront
            className="w-full opacity-70 grayscale"
            cardCode={revealed.cardCode}
            description={revealed.description}
            durationSeconds={revealed.durationSeconds}
            effectType={revealed.effectType}
            effectValue={revealed.effectValue}
            targetType={revealed.targetType}
            tier={revealed.tier ?? 'S'}
          />
          <UsedStamp />
        </div>
      ) : (
        <UnknownCardFace className="w-[min(82vw,18rem)]" used={isUsed} />
      )}
    </CardPreviewOverlay>
  );
}
