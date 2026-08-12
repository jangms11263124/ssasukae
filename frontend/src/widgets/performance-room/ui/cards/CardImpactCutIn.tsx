'use client';

import { useEffect, useState } from 'react';

import { CARD_EFFECT_VISUALS, formatCardEffectValue } from '@/entities/card';
import { cn } from '@/shared/lib/cn';

import { cardEffectKey, useCardStore } from '../../model/cardStore';
import { useNicknameOf } from '../../model/useNicknameOf';

/** 컷인이 완전히 사라지기까지의 시간. 노래가 진행 중이라 짧게 끊는다 */
const CUT_IN_HOLD_MS = 1600;
/** 퇴장 페이드 시작 시점 */
const CUT_IN_FADE_AT_MS = 1300;

/** 음파 리플 각 겹의 테두리 두께·블러·시작 지연. 겹마다 시차를 줘 파동이 연달아 퍼진다 */
const RIPPLE_LAYERS = [
  { blurClass: 'border-8 blur-md', delayMs: 0 },
  { blurClass: 'border-4 blur-sm', delayMs: 140 },
  { blurClass: 'border-2 blur-[2px]', delayMs: 280 },
] as const;

/**
 * 효과가 시작된 순간을 알리는 격투게임식 히트 컷인.
 *
 * 카운트다운(3-2-1)이 쌓아 둔 긴장을 받아 주는 자리 — 화이트 플래시와 함께 음파 같은
 * 흐린 동심원이 연달아 퍼지고, 카드명이 슬램으로 내리꽂힌 뒤 곧 좌측 상단 원형 게이지
 * (ActiveEffectRing)로 넘긴다. 무대 세로 중앙에 띄워 하단 가사와 겹치지 않는다.
 */
export function CardImpactCutIn() {
  const activeEffect = useCardStore((state) => state.activeEffect);
  const nicknameOf = useNicknameOf();

  // 효과 1건을 구분하는 키. 새 효과가 시작될 때만 컷인을 재생한다.
  const effectKey = activeEffect === null ? null : cardEffectKey(activeEffect);

  // 마운트 시점에 이미 걸려 있던 효과(새로고침 복구)는 지난 일이므로 컷인을 재생하지 않는다.
  const [playedKey, setPlayedKey] = useState(effectKey);
  const [phase, setPhase] = useState<'in' | 'out' | null>(null);

  if (effectKey !== playedKey) {
    setPlayedKey(effectKey);
    setPhase(effectKey === null ? null : 'in');
  }

  useEffect(() => {
    if (phase !== 'in') return;

    const fadeTimer = window.setTimeout(() => setPhase('out'), CUT_IN_FADE_AT_MS);
    const hideTimer = window.setTimeout(() => setPhase(null), CUT_IN_HOLD_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [phase, playedKey]);

  if (activeEffect === null || phase === null) {
    return null;
  }

  const visual = CARD_EFFECT_VISUALS[activeEffect.effectType];
  const cardTitle = activeEffect.cardName ?? visual.title;
  const valueLabel = formatCardEffectValue(activeEffect.effectType, activeEffect.effectValue);

  // 슬램 본문과 RGB 잔상 사본이 같은 내용을 그린다.
  const titleContent = (
    <>
      {cardTitle}
      {valueLabel !== null ? (
        <span className="ml-2 font-mono text-xl not-italic">{valueLabel}</span>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-30 flex items-center overflow-hidden transition-opacity duration-300',
        phase === 'out' && 'opacity-0',
      )}
      role="status"
    >
      {/* 히트 프레임 — 타격 순간의 화이트 플래시 */}
      <div aria-hidden="true" className="absolute inset-0 animate-impact-flash bg-white" />

      {/* 무대 가장자리에서 번지는 효과색 섬광 */}
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-card-cut-in-flash"
        style={{
          background: `radial-gradient(ellipse at center, transparent 35%, ${visual.accent}55 100%)`,
        }}
      />

      {/* 타격 지점에서 음파처럼 연달아 퍼지는 흐린 동심원 */}
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
        {RIPPLE_LAYERS.map(({ blurClass, delayMs }) => (
          <div
            key={delayMs}
            className={cn(
              'col-start-1 row-start-1 size-52 animate-impact-ripple rounded-full',
              blurClass,
            )}
            style={{ borderColor: visual.accent, animationDelay: `${delayMs}ms` }}
          />
        ))}
      </div>

      {/* 타격 반동 래퍼 — 밴드가 흔들리며 들어온다 */}
      <div className="relative w-full animate-impact-shake">
        <div
          className="relative w-full animate-card-cut-in border-y bg-black/75 py-4 backdrop-blur-sm"
          style={{
            borderColor: `${visual.accent}99`,
            boxShadow: `0 0 40px ${visual.accent}40, inset 0 0 60px ${visual.accent}1f`,
          }}
        >
          {/* 왼쪽 굵은 액센트 바 — 밴드가 화면을 가로지르는 방향을 잡아 준다 */}
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1.5"
            style={{ background: visual.accent }}
          />

          <p
            className="text-center font-mono text-[11px] tracking-[0.28em]"
            style={{ color: visual.accent }}
          >
            ATTACK CARD ACTIVATED
          </p>

          <p className="mt-2 text-center text-lg font-bold text-white">
            <span style={{ color: visual.accent }}>
              {nicknameOf(activeEffect.sourceParticipantId)}
            </span>
            님이 카드를 사용했습니다
          </p>

          {/* 카드명 슬램 + RGB 잔상 */}
          <div className="relative mt-1">
            <p
              aria-hidden="true"
              className="absolute inset-0 animate-impact-ghost-a text-center text-3xl font-black uppercase italic tracking-tight text-neon-pink mix-blend-screen"
            >
              {titleContent}
            </p>
            <p
              aria-hidden="true"
              className="absolute inset-0 animate-impact-ghost-b text-center text-3xl font-black uppercase italic tracking-tight text-neon-cyan mix-blend-screen"
            >
              {titleContent}
            </p>
            <p
              className="animate-impact-slam text-center text-3xl font-black uppercase italic tracking-tight text-white"
              style={{ textShadow: `0 0 24px ${visual.accent}b3` }}
            >
              {titleContent}
            </p>
          </div>

          <p className="mt-2 text-center font-mono text-xs tracking-[0.16em] text-zinc-400">
            TARGET: {nicknameOf(activeEffect.targetParticipantId)}
          </p>
        </div>
      </div>

    </div>
  );
}
