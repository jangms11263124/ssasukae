'use client';

import { CARD_ASPECT } from '@/entities/card';

import { useCardStore } from '../../model/cardStore';
import { UnknownCardFace } from './UnknownCardFace';

/** 부채꼴로 벌어지는 최대 각도(맨 왼쪽/오른쪽 카드 기준) */
const FAN_MAX_ANGLE_DEG = 16;

/**
 * 가창자 화면의 공격 카드 부채. 가창자는 카드를 받지 않으므로 그 자리에
 * '나를 향해 남아 있는 카드'를 손에 쥔 카드처럼 부채꼴로 펼쳐 보여준다 —
 * 몇 장인지 한눈에 세어지고, 맨 위 카드에 남은 장수가 크게 적힌다.
 * 카드가 사용되면 위로 날아가며 사라지고 남은 카드가 다시 부채로 정렬된다.
 * 영역 자체는 유지되므로 카드가 줄어도 옆 캠 크기는 흔들리지 않는다.
 */
export function PerformerCardStack() {
  const cardHolders = useCardStore((state) => state.cardHolders);

  const states = Object.values(cardHolders);
  const total = states.length;
  const usedCount = states.filter((state) => state === 'USED').length;
  const remaining = total - usedCount;

  // 카드가 배분되기 전(공연 시작 전)에는 보여줄 부채가 없다.
  if (total === 0) {
    return null;
  }

  const allUsed = remaining === 0;
  // 남은 카드끼리 부채를 다시 편다 — 한 장이 빠지면 나머지가 벌어진 각을 메운다.
  const angleStep = remaining > 1 ? (2 * FAN_MAX_ANGLE_DEG) / (remaining - 1) : 0;

  return (
    <div className="hidden shrink-0 grow flex-col items-center justify-center gap-1.5 pb-3 pt-1 lg:flex">
      {/*
        높이는 남는 공간만큼 쓰되, 부채가 벌어진 전체 폭이 레일(100cqw)을 넘지 않는
        상한을 건다 — 회전한 카드의 좌우 도달 거리는 높이의 약 1.3배다.
      */}
      <div
        className="relative w-full min-h-24 flex-1"
        style={{ maxHeight: 'min(20rem, 75cqw)' }}
      >
        {Array.from({ length: total }, (_, index) => {
          // 왼쪽(index 0)부터 사용된다. 오른쪽 카드가 위에 쌓인다 — 손에 쥔 부채와 같다.
          const isUsed = index < usedCount;
          // 남은 카드 안에서의 자리로 각도를 매긴다 (사용된 카드는 부채에서 빠진다).
          const fanPosition = index - usedCount;
          const angle = remaining > 1 ? -FAN_MAX_ANGLE_DEG + angleStep * fanPosition : 0;
          // 남은 장수는 맨 위(맨 오른쪽) 카드에 적는다.
          const showCount = index === total - 1 && !isUsed;

          return (
            <div
              key={index}
              aria-hidden="true"
              className="absolute left-1/2 top-0 h-[90%] transition-[transform,opacity] duration-500 ease-out"
              style={{
                aspectRatio: CARD_ASPECT,
                zIndex: index,
                // 카드 아래쪽 바깥에 피벗을 두면 손목으로 쥔 것처럼 호를 그린다.
                transformOrigin: '50% 115%',
                // 사용된 카드는 위로 날아가며 사라진다 — 까맣게 남기지 않는다.
                transform: isUsed
                  ? 'translateX(-50%) translateY(-40%) rotate(10deg) scale(0.9)'
                  : `translateX(-50%) rotate(${angle}deg)`,
                opacity: isUsed ? 0 : 1,
                pointerEvents: 'none',
                filter: 'drop-shadow(-6px 2px 10px rgb(0 0 0 / 60%))',
              }}
            >
              <UnknownCardFace
                className="size-full"
                mark={showCount ? `${remaining}/${total}` : undefined}
                markSizeCqw={showCount ? 26 : 32}
              />
            </div>
          );
        })}

        {allUsed ? (
          <p className="absolute inset-0 grid place-items-center break-keep px-2 text-center text-sm font-semibold leading-relaxed text-zinc-400">
            카드가 모두
            <br />
            사용되었어요
          </p>
        ) : null}
      </div>

      <span className="shrink-0 font-mono text-[10px] tracking-[0.18em] text-zinc-500">
        ATTACK CARDS · {allUsed ? 'ALL USED' : `${remaining}/${total}`}
      </span>
    </div>
  );
}
