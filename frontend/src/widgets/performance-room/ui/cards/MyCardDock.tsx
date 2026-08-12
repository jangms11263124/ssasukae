'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  AttackCardFront,
  CARD_EFFECT_VISUALS,
  cardTierFromDuration,
  HoloMiniCard,
} from '@/entities/card';
import { cn } from '@/shared/lib/cn';

import { useCardStore } from '../../model/cardStore';
import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageStore } from '../../model/stageStore';
import { resolveCardActionLabel, resolveCardStatusLabel } from './cardActionLabels';

interface MyCardDockProps {
  /**
   * tile — 내 캠 타일 우상단 도킹
   * stage — 스트립에 내가 없을 때 스테이지 우하단 폴백
   */
  placement?: 'tile' | 'stage';
}

/**
 * 내 공격 카드 독. 캠(또는 스테이지) 모서리 미니 카드를 누르면 앞면과 사용 버튼이 열린다.
 * 미리보기는 body 포털로 띄워 캠 타일 overflow에 잘리지 않게 한다.
 * 방 전체에 카드가 하나라도 대기/발동 중이면 사용할 수 없다.
 */
export function MyCardDock({ placement = 'tile' }: MyCardDockProps) {
  const myCard = useCardStore((state) => state.myCard);
  const myCardStatus = useCardStore((state) => state.myCardStatus);
  const pendingActivation = useCardStore((state) => state.pendingActivation);
  const activeEffect = useCardStore((state) => state.activeEffect);
  const phase = useStageStore((state) => state.phase);
  const socket = useRoomSocketContext();

  // 어느 카드로 열었는지를 기억한다 — 카드가 바뀌거나 회수되면 저절로 닫힌 상태가 된다.
  const [openCardKey, setOpenCardKey] = useState<string | null>(null);
  const cardKey = myCard === null ? null : `${myCard.performanceId}-${myCard.cardId}`;
  const isOpen = cardKey !== null && openCardKey === cardKey;

  const setIsOpen = (open: boolean) => setOpenCardKey(open ? cardKey : null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ bottom: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setPanelPos(null);
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      // 트리거 바로 위에 고정 — 타일/스테이지 overflow와 무관하게 전체가 보인다.
      setPanelPos({
        bottom: window.innerHeight - rect.top + 10,
        left: rect.left + rect.width / 2,
      });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenCardKey(null);
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpenCardKey(null);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  if (myCard === null) {
    return null;
  }

  const roomCardBusy = pendingActivation !== null || activeEffect !== null;
  const canUse = myCardStatus === 'ASSIGNED' && phase === 'PERFORMING' && !roomCardBusy;
  const tier = myCard.tier ?? cardTierFromDuration(myCard.durationSeconds) ?? 'S';
  const cardTitle = myCard.cardName ?? CARD_EFFECT_VISUALS[myCard.effectType].title;
  const isUsed = myCardStatus === 'USED';

  const statusLabel = resolveCardStatusLabel(myCardStatus, roomCardBusy);
  const actionLabel = resolveCardActionLabel(myCardStatus, phase, roomCardBusy);

  const handleActivate = () => {
    if (!canUse) return;
    socket.sendCardActivate();
    setIsOpen(false);
  };

  const preview =
    isOpen && panelPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`${cardTitle} 카드 미리보기`}
            className="fixed z-[70] flex w-64 flex-col items-center gap-3 border border-white/10 bg-[#151517] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
            style={{
              bottom: panelPos.bottom,
              left: panelPos.left,
              transform: 'translateX(-50%)',
            }}
          >
            <AttackCardFront
              className="w-full"
              cardCode={myCard.cardCode}
              description={myCard.description ?? undefined}
              durationSeconds={myCard.durationSeconds}
              effectType={myCard.effectType}
              effectValue={myCard.effectValue}
              targetType={myCard.targetType}
              tier={tier}
            />

            <button
              type="button"
              disabled={!canUse}
              onClick={handleActivate}
              className={cn(
                'min-h-9 w-full px-4 font-mono text-[11px] tracking-[0.12em] transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
                canUse
                  ? 'border border-cyan-300/70 bg-cyan-950/40 text-cyan-200 hover:border-cyan-200 hover:bg-cyan-900/40'
                  : 'cursor-not-allowed border border-white/10 bg-white/5 text-zinc-600',
              )}
            >
              {actionLabel}
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={cn(
        'absolute z-30',
        placement === 'tile' ? 'top-1.5 right-1.5' : 'right-3 bottom-3',
      )}
    >
      {preview}

      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-label={`내 공격 카드 ${cardTitle} (${statusLabel}) 상세 열기`}
        title={`${cardTitle} · ${statusLabel}`}
        onClick={() => setIsOpen(!isOpen)}
        className="group rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        <HoloMiniCard className="w-12" used={isUsed} interactive />
      </button>
    </div>
  );
}
