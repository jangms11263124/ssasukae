'use client';

import { useState } from 'react';

import { CARD_ASPECT, CARD_EFFECT_VISUALS, cardTierFromDuration } from '@/entities/card';
import { useRoomStore } from '@/entities/room';
import { cn } from '@/shared/lib/cn';

import { useCardStore } from '../../model/cardStore';
import { useStageStore } from '../../model/stageStore';
import { resolveCardStatusLabel } from './cardActionLabels';
import { CompactCardFace } from './CompactCardFace';
import { MyCardPreviewOverlay } from './MyCardPreviewOverlay';
import { PerformerCardStack } from './PerformerCardStack';

/**
 * 데스크톱 왼쪽 캠 레일의 카드 자리(레일 상단, 캠 스트립 위). 캠 스트립이 쓰고 남은
 * 세로 공간을 받아 크게 노출한다.
 *
 * 참가자는 자기 카드를 앞면으로 본다 — 내용은 이미 아는 정보라 가릴 이유가 없고,
 * 누르면 카드가 화면 중앙에 크게 떠서 확인 후 사용까지 확정할 수 있다.
 * 가창자는 받는 카드가 없어 대신 자신을 향해 남은 카드 더미가 놓인다.
 * 모바일은 내 캠 타일 모서리의 MyCardDock을 쓴다.
 */
export function MyCardCorner() {
  const myCard = useCardStore((state) => state.myCard);
  const myCardStatus = useCardStore((state) => state.myCardStatus);
  const pendingActivation = useCardStore((state) => state.pendingActivation);
  const activeEffect = useCardStore((state) => state.activeEffect);

  const myParticipantId = useRoomStore((state) => state.session?.myParticipantId);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);

  // 어느 카드로 열었는지를 기억한다 — 카드가 바뀌거나 회수되면 저절로 닫힌 상태가 된다.
  const [openCardKey, setOpenCardKey] = useState<string | null>(null);
  const cardKey = myCard === null ? null : `${myCard.performanceId}-${myCard.cardId}`;
  const isOpen = cardKey !== null && openCardKey === cardKey;

  if (myCard === null) {
    const isPerformer =
      myParticipantId !== undefined && myParticipantId === performerParticipantId;

    return isPerformer ? <PerformerCardStack /> : null;
  }

  const roomCardBusy = pendingActivation !== null || activeEffect !== null;
  const cardTitle = myCard.cardName ?? CARD_EFFECT_VISUALS[myCard.effectType].title;
  const tier = myCard.tier ?? cardTierFromDuration(myCard.durationSeconds) ?? 'S';
  const isUsed = myCardStatus === 'USED';
  const statusLabel = resolveCardStatusLabel(myCardStatus, roomCardBusy);

  return (
    // 레일에서 캠 스트립이 쓰고 남은 세로 공간을 받아(grow) 카드가 채운다.
    // shrink-0 — 공간이 모자라도 카드가 잘리는 대신 스트립이 스크롤되게 한다.
    <div className="hidden shrink-0 grow justify-center pb-3 pt-1 lg:flex">
      {isOpen ? <MyCardPreviewOverlay onClose={() => setOpenCardKey(null)} /> : null}

      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={`내 공격 카드 ${cardTitle} (${statusLabel}) 크게 보기`}
        title={`${cardTitle} · ${statusLabel}`}
        onClick={() => setOpenCardKey(isOpen ? null : cardKey)}
        className="group flex min-h-0 flex-col items-center justify-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        {/*
          남는 높이만큼 커지되(비율 고정) 최소 크기는 보장한다. 상한은 레일 폭(100cqw)에서
          역산한다 — 없으면 레일을 좁혔을 때 카드 폭이 레일 밖으로 넘친다.
        */}
        <div
          className="min-h-24 min-w-0 flex-1"
          style={{
            aspectRatio: CARD_ASPECT,
            maxHeight: `min(22rem, ${Math.round(100 / CARD_ASPECT)}cqw)`,
          }}
        >
          <CompactCardFace
            className="size-full transition-transform duration-200 ease-out group-hover:scale-[1.03] group-active:scale-[0.97]"
            effectType={myCard.effectType}
            effectValue={myCard.effectValue}
            tier={tier}
            used={isUsed}
          />
        </div>
        <span
          className={cn(
            'shrink-0 font-mono text-[10px] tracking-[0.18em] transition-colors',
            isUsed ? 'text-zinc-600' : 'text-zinc-500 group-hover:text-cyan-200',
          )}
        >
          MY CARD · {statusLabel}
        </span>
      </button>
    </div>
  );
}
