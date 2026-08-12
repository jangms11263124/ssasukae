'use client';

import type { ParticipantCardState } from '../../model/cardStore';
import { CardPreviewOverlay } from './CardPreviewOverlay';
import { UnknownCardFace } from './UnknownCardFace';

interface PeerCardPreviewOverlayProps {
  nickname: string;
  cardState: ParticipantCardState;
  onClose: () => void;
}

/**
 * 다른 참가자의 카드 확인 오버레이. 카드 내용은 개인 큐로만 오므로 우리는 보유 여부만 안다 —
 * 뒷면 위에 물음표를 얹어 '무엇이 올지 모른다'를 그대로 보여준다.
 */
export function PeerCardPreviewOverlay({
  nickname,
  cardState,
  onClose,
}: PeerCardPreviewOverlayProps) {
  const isUsed = cardState === 'USED';

  return (
    <CardPreviewOverlay
      ariaLabel={`${nickname}님의 공격 카드`}
      onClose={onClose}
      caption={
        isUsed ? (
          `${nickname}님은 카드를 이미 사용했어요.`
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
      <UnknownCardFace className="w-[min(82vw,18rem)]" used={isUsed} />
    </CardPreviewOverlay>
  );
}
