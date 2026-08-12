'use client';

import { CARD_EFFECT_VISUALS, formatCardEffectValue } from '@/entities/card';
import { cn } from '@/shared/lib/cn';

import { useCardStore, type ActiveCardEffect } from '../../model/cardStore';
import { useNicknameOf } from '../../model/useNicknameOf';
import { REMAINING_TICK_MS, useRemainingMs } from '../../model/useRemainingSeconds';

/** 진행 호 반지름 (viewBox 120 기준) */
const RING_RADIUS = 50;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** 남은 시간이 이 이하로 떨어지면 긴급 연출로 바뀐다 */
const URGENT_SECONDS = 3;

/**
 * 효과 발동 중 무대 좌측 상단에 뜨는 원형 잔여 시간 게이지.
 * 시간이 흐를수록 호가 12시 방향으로 되감기며 깎여 나가 "사용 시간이 차감되는" 감각을 준다.
 *
 * 상단 중앙은 카운트다운(발동 전)·컷인(발동 순간) 문구가 지나가는 길이고 우측 상단은
 * 미디어 컨트롤 자리다 — 지속 상태 표시는 좌측 상단에 두어 셋이 서로 가리지 않는다.
 */
export function ActiveEffectRing() {
  const activeEffect = useCardStore((state) => state.activeEffect);

  // 효과가 시작될 때 링을 새로 마운트해야 useRemainingMs가 그 시점의 시계로 센다.
  if (activeEffect === null) {
    return null;
  }

  return <EffectRing activeEffect={activeEffect} />;
}

function EffectRing({ activeEffect }: { activeEffect: ActiveCardEffect }) {
  const nicknameOf = useNicknameOf();
  const remainingMs = useRemainingMs(activeEffect.endsAt);
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  const visual = CARD_EFFECT_VISUALS[activeEffect.effectType];
  const cardTitle = activeEffect.cardName ?? visual.title;
  const valueLabel = formatCardEffectValue(activeEffect.effectType, activeEffect.effectValue);

  // 스냅샷 복구로 시작 시각을 모르면 진행 호 대신 회전 점선 링(불확정)을 보여준다.
  const totalMs =
    activeEffect.startedAt === null
      ? null
      : Math.max(
          1000,
          new Date(activeEffect.endsAt).getTime() - new Date(activeEffect.startedAt).getTime(),
        );
  const progress = totalMs === null ? null : Math.min(1, remainingMs / totalMs);
  const isUrgent = remainingSeconds <= URGENT_SECONDS;

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-20">
      <div className="flex animate-effect-ring-in flex-col items-center">
        <div className="relative size-28">
          {/* 뒤판 디스크 — 무대 위에서도 숫자가 읽히게 깔아 준다 */}
          <div className="absolute inset-[13px] rounded-full border border-white/10 bg-black/75 backdrop-blur-sm" />

          {/* 긴급 구간: 디스크가 효과색으로 맥동한다 */}
          {isUrgent ? (
            <div
              aria-hidden="true"
              className="absolute inset-[13px] animate-card-effect-pulse rounded-full"
              style={{
                boxShadow: `inset 0 0 22px ${visual.accent}66, 0 0 26px ${visual.accent}59`,
              }}
            />
          ) : null}

          {/* 장식 점선 링 — 천천히 돌며 HUD 조준선 느낌을 낸다 */}
          <svg
            aria-hidden="true"
            viewBox="0 0 120 120"
            className="absolute inset-0 animate-[ring-spin_22s_linear_infinite]"
          >
            <circle
              cx="60"
              cy="60"
              r="57"
              fill="none"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="1"
              strokeDasharray="2 5"
            />
          </svg>

          {progress === null ? (
            /* 불확정 링 — 총 지속시간을 몰라 차감 대신 회전으로 "진행 중"만 알린다 */
            <svg
              aria-hidden="true"
              viewBox="0 0 120 120"
              className="absolute inset-0 animate-[ring-spin_2.4s_linear_infinite]"
              style={{ filter: `drop-shadow(0 0 6px ${visual.accent})` }}
            >
              <circle
                cx="60"
                cy="60"
                r={RING_RADIUS}
                fill="none"
                stroke={visual.accent}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="30 14"
                opacity="0.85"
              />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 120 120" className="absolute inset-0">
              {/* 트랙 */}
              <circle
                cx="60"
                cy="60"
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="5"
              />
              {/* 진행 호 — 틱(200ms)마다 갱신되고 같은 길이의 transition으로 이어져 연속으로 깎인다 */}
              <circle
                cx="60"
                cy="60"
                r={RING_RADIUS}
                fill="none"
                stroke={visual.accent}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                transform="rotate(-90 60 60)"
                style={{
                  filter: `drop-shadow(0 0 6px ${visual.accent})`,
                  transition: `stroke-dashoffset ${REMAINING_TICK_MS}ms linear`,
                }}
              />
              {/* 호 끝의 글로우 도트 — 깎이는 지점을 따라간다 */}
              <g
                style={{
                  transform: `rotate(${progress * 360}deg)`,
                  transformOrigin: '60px 60px',
                  transition: `transform ${REMAINING_TICK_MS}ms linear`,
                }}
              >
                <circle
                  cx="60"
                  cy={60 - RING_RADIUS}
                  r="4"
                  fill="#fff"
                  style={{
                    filter: `drop-shadow(0 0 6px ${visual.accent}) drop-shadow(0 0 12px ${visual.accent})`,
                  }}
                />
              </g>
            </svg>
          )}

          {/* 중앙 잔여 초 — 초가 바뀔 때마다 요소를 갈아 끼워 팝이 다시 돈다 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p
              key={remainingSeconds}
              className={cn(
                'text-3xl font-black italic leading-none tabular-nums text-white',
                isUrgent ? 'animate-ring-tick-pop-urgent' : 'animate-ring-tick-pop',
              )}
              style={{ textShadow: `0 0 18px ${visual.accent}b3` }}
            >
              {remainingSeconds}
            </p>
            <p className="mt-1 font-mono text-[8px] tracking-[0.3em] text-zinc-500">SEC</p>
          </div>
        </div>

        {/* 카드명 + 수치 */}
        <div
          className="mt-2 flex items-center gap-2 border bg-black/80 px-3 py-1 backdrop-blur-sm"
          style={{ borderColor: `${visual.accent}80` }}
        >
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 animate-pulse rounded-full"
            style={{ background: visual.accent, boxShadow: `0 0 8px ${visual.accent}` }}
          />
          <p className="truncate text-xs font-black uppercase italic tracking-tight text-white">
            {cardTitle}
            {valueLabel !== null ? (
              <span
                className="ml-1.5 font-mono text-[11px] not-italic"
                style={{ color: visual.accent }}
              >
                {valueLabel}
              </span>
            ) : null}
          </p>
        </div>

        {/* 공격자 > 대상 */}
        <p className="mt-1 font-mono text-[10px] text-zinc-400 [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
          {nicknameOf(activeEffect.sourceParticipantId)}
          <span className="px-1 text-zinc-600">&gt;</span>
          {nicknameOf(activeEffect.targetParticipantId)}
        </p>
      </div>
    </div>
  );
}
