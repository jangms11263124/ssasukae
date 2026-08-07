'use client';

import { CARD_EFFECT_VISUALS, formatCardEffectValue } from '@/entities/card';

import { useCardStore, type ActiveCardEffect } from '../../model/cardStore';
import { useNicknameOf } from '../../model/useNicknameOf';
import { useRemainingSeconds } from '../../model/useRemainingSeconds';

function formatRemaining(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * 효과 발동 중 무대 상단 중앙에 붙는 공격 정보 배너 (카드명 / 공격자 > 대상 / 남은 시간).
 *
 * 우측 상단은 미디어 컨트롤 자리라 겹친다 — 카운트다운이 쓰던 상단 중앙을 이어받는다
 * (카운트다운은 효과가 시작되면 사라지므로 동시에 뜨지 않는다).
 */
export function ActiveEffectBanner() {
  const activeEffect = useCardStore((state) => state.activeEffect);

  // 효과가 시작될 때 배너를 새로 마운트해야 useRemainingSeconds가 그 시점의 시계로 센다.
  if (activeEffect === null) {
    return null;
  }

  return <EffectBanner activeEffect={activeEffect} />;
}

function EffectBanner({ activeEffect }: { activeEffect: ActiveCardEffect }) {
  const nicknameOf = useNicknameOf();
  const remainingSeconds = useRemainingSeconds(activeEffect.endsAt);

  const visual = CARD_EFFECT_VISUALS[activeEffect.effectType];
  const cardTitle = activeEffect.cardName ?? visual.title;
  const valueLabel = formatCardEffectValue(activeEffect.effectType, activeEffect.effectValue);

  // 스냅샷 복구로 시작 시각을 모르면 진행 바 없이 남은 시간만 보여준다.
  const totalSeconds =
    activeEffect.startedAt === null
      ? null
      : Math.max(
          1,
          Math.round(
            (new Date(activeEffect.endsAt).getTime() -
              new Date(activeEffect.startedAt).getTime()) /
              1000,
          ),
        );
  const progress = totalSeconds === null ? null : remainingSeconds / totalSeconds;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
      <div
        className="overflow-hidden border bg-black/80 backdrop-blur-sm"
        style={{ borderColor: `${visual.accent}80` }}
      >
        <div className="flex items-center gap-3 px-4 py-2">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 animate-pulse rounded-full"
            style={{ background: visual.accent, boxShadow: `0 0 8px ${visual.accent}` }}
          />
          <p className="truncate text-sm font-black uppercase italic tracking-tight text-white">
            {cardTitle}
            {valueLabel !== null ? (
              <span className="ml-1.5 font-mono text-xs not-italic" style={{ color: visual.accent }}>
                {valueLabel}
              </span>
            ) : null}
          </p>
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-white/15" />
          <p className="shrink-0 truncate font-mono text-[11px] text-zinc-400">
            {nicknameOf(activeEffect.sourceParticipantId)}
            <span className="px-1 text-zinc-600">&gt;</span>
            {nicknameOf(activeEffect.targetParticipantId)}
          </p>
          <p
            className="shrink-0 font-mono text-xs tabular-nums"
            style={{ color: visual.accent }}
          >
            {formatRemaining(remainingSeconds)}
          </p>
        </div>

        {progress !== null ? (
          <div className="h-0.5 w-full bg-white/10">
            <div
              className="h-full transition-[width] duration-200 ease-linear"
              style={{ background: visual.accent, width: `${progress * 100}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
