'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';

import { cn } from '@/shared/lib/cn';

import { clamp, round } from '../lib/cardMotionMath';
import { createSpring, SPRING_INTERACT, SPRING_POPOVER } from '../lib/cardSpring';
import type { CardTier } from '../types';

import { AttackCardDepth } from './AttackCardDepth';

import './attack-card-deal.css';
import './attack-card-depth.css';

interface AttackCardDealFlipProps {
  back: ReactNode;
  className?: string;
  confirming?: boolean;
  front: ReactNode;
  onReady?: () => void;
  onReveal?: () => void;
  onFlipSettled?: () => void;
  onConfirm?: () => void;
  revealed: boolean;
  /** 등급별 등장·확정 연출 강도 (S < G < P) */
  tier?: CardTier;
}

const DEAL_READY_FALLBACK_MS = 2000;

/** 등장 시 Y축 스핀 각도 — 360° 배수만 사용 (180°에서 앞면이 보이므로) */
const TIER_DEAL_SPIN_DEG: Record<CardTier, number> = {
  S: 360,
  G: 720,
  P: 1080,
};

const TIER_START_SCALE: Record<CardTier, number> = {
  S: 0.52,
  G: 0.44,
  P: 0.36,
};

const TIER_FLIP_MS: Record<CardTier, number> = {
  S: 550,
  G: 650,
  P: 720,
};

/**
 * pokemon-cards-css Card.svelte 기반 배분 연출.
 * firstPop(화면 밖 → 중앙 + Y 360°) + 커서 스프링 틸트.
 */
export function AttackCardDealFlip({
  back,
  className,
  confirming = false,
  front,
  onReady,
  onReveal,
  onFlipSettled,
  onConfirm,
  revealed,
  tier = 'S',
}: AttackCardDealFlipProps) {
  const [landed, setLanded] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipSettled, setFlipSettled] = useState(revealed);
  const rootRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const onFlipSettledRef = useRef(onFlipSettled);
  const landedRef = useRef(false);

  // 스프링은 ref에만 보관하고, 렌더에서는 .current를 읽지 않는다.
  const springTranslateRef = useRef(createSpring({ x: 0, y: 0 }, SPRING_POPOVER));
  const springScaleRef = useRef(createSpring(1, SPRING_POPOVER));
  const springRotateDeltaRef = useRef(createSpring({ x: 0, y: 0 }, SPRING_POPOVER));
  const springRotateRef = useRef(createSpring({ x: 0, y: 0 }, SPRING_INTERACT));

  const txRef = useRef(0);
  const tyRef = useRef(0);
  const scaleRef = useRef(1);
  const deltaXRef = useRef(0);
  const deltaYRef = useRef(0);
  const tiltXRef = useRef(0);
  const tiltYRef = useRef(0);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onFlipSettledRef.current = onFlipSettled;
  }, [onFlipSettled]);

  const paint = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    root.style.setProperty('--translate-x', `${txRef.current}px`);
    root.style.setProperty('--translate-y', `${tyRef.current}px`);
    root.style.setProperty('--card-scale', String(scaleRef.current));
    root.style.setProperty('--rotate-x', `${tiltXRef.current + deltaXRef.current}deg`);
    root.style.setProperty('--rotate-y', `${tiltYRef.current + deltaYRef.current}deg`);
  }, []);

  useEffect(() => {
    const springTranslate = springTranslateRef.current;
    const springScale = springScaleRef.current;
    const springRotateDelta = springRotateDeltaRef.current;
    const springRotate = springRotateRef.current;

    const unsubs = [
      springTranslate.subscribe((v) => {
        txRef.current = v.x;
        tyRef.current = v.y;
        paint();
      }),
      springScale.subscribe((v) => {
        scaleRef.current = v;
        paint();
      }),
      springRotateDelta.subscribe((v) => {
        deltaXRef.current = v.x;
        deltaYRef.current = v.y;
        paint();
      }),
      springRotate.subscribe((v) => {
        tiltXRef.current = v.x;
        tiltYRef.current = v.y;
        paint();
      }),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [paint]);

  useEffect(() => {
    const springTranslate = springTranslateRef.current;
    const springScale = springScaleRef.current;
    const springRotateDelta = springRotateDeltaRef.current;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let cancelled = false;
    let fallbackTimer = 0;
    let startId = 0;

    const markReady = () => {
      if (cancelled || landedRef.current) return;
      landedRef.current = true;
      setLanded(true);
      onReadyRef.current?.();
    };

    if (reduced) {
      void springTranslate.set({ x: 0, y: 0 }, { hard: true });
      void springScale.set(1, { hard: true });
      void springRotateDelta.set({ x: 0, y: 0 }, { hard: true });
      markReady();
      return;
    }

    const start = {
      x: round(window.innerWidth * 0.55 + 160),
      y: round(-(window.innerHeight * 0.55 + 120)),
    };

    void springTranslate.set(start, { hard: true });
    void springScale.set(TIER_START_SCALE[tier], { hard: true });
    void springRotateDelta.set({ x: 0, y: 0 }, { hard: true });

    startId = requestAnimationFrame(() => {
      void Promise.all([
        springTranslate.set({ x: 0, y: 0 }),
        springScale.set(1),
        springRotateDelta.set({ x: TIER_DEAL_SPIN_DEG[tier], y: 0 }),
      ]).then(() => {
        void springRotateDelta.set({ x: 0, y: 0 }, { hard: true });
        markReady();
      });
    });

    fallbackTimer = window.setTimeout(markReady, DEAL_READY_FALLBACK_MS);

    return () => {
      cancelled = true;
      cancelAnimationFrame(startId);
      window.clearTimeout(fallbackTimer);
    };
    // 카드 배정마다 CardDealContent key로 리마운트되므로 tier는 마운트 시점 값만 쓴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entrance runs once per deal
  }, []);

  useLayoutEffect(() => {
    if (!confirming) return;
    void springRotateRef.current.set({ x: 0, y: 0 }, { hard: true });
  }, [confirming]);

  const startFlip = useCallback(() => {
    setIsFlipping(true);
    setFlipSettled(false);
    setIsInteracting(false);
    void springRotateRef.current.set({ x: 0, y: 0 }, { hard: true });
  }, []);

  useEffect(() => {
    if (!revealed || !isFlipping) return;

    const flipEl = flipRef.current;
    const finishFlip = () => {
      setIsFlipping(false);
      setFlipSettled(true);
      onFlipSettledRef.current?.();
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName !== 'transform') return;
      finishFlip();
    };

    flipEl?.addEventListener('transitionend', onTransitionEnd);
    const fallbackTimer = window.setTimeout(finishFlip, TIER_FLIP_MS[tier] + 80);

    return () => {
      flipEl?.removeEventListener('transitionend', onTransitionEnd);
      window.clearTimeout(fallbackTimer);
    };
  }, [isFlipping, revealed, tier]);

  const handlePointerEnter = useCallback(() => {
    if (confirming || isFlipping) return;
    const springRotate = springRotateRef.current;
    springRotate.stiffness = SPRING_INTERACT.stiffness;
    springRotate.damping = SPRING_INTERACT.damping;
  }, [confirming, isFlipping]);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (confirming || isFlipping) return;

      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const absolute = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const percent = {
        x: clamp(round((100 / rect.width) * absolute.x)),
        y: clamp(round((100 / rect.height) * absolute.y)),
      };
      const center = {
        x: percent.x - 50,
        y: percent.y - 50,
      };

      const springRotate = springRotateRef.current;
      springRotate.stiffness = SPRING_INTERACT.stiffness;
      springRotate.damping = SPRING_INTERACT.damping;

      void springRotate.set({
        x: round(-(center.x / 10)),
        y: round(center.y / 10),
      });
      setIsInteracting(Math.abs(center.x) > 2 || Math.abs(center.y) > 2);
    },
    [confirming, isFlipping],
  );

  const resetTilt = useCallback(() => {
    if (confirming) return;
    setIsInteracting(false);
    const springRotate = springRotateRef.current;
    springRotate.stiffness = 0.01;
    springRotate.damping = 0.06;
    void springRotate.set({ x: 0, y: 0 }, { soft: 1 });
  }, [confirming]);

  const handleCardActivate = () => {
    if (!landed || confirming) return;
    if (!revealed) {
      startFlip();
      onReveal?.();
      return;
    }
    onConfirm?.();
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        'attack-card-deal',
        `attack-card-deal--${tier}`,
        'is-entering',
        landed && 'is-landed',
        isFlipping && 'is-flipping',
        isInteracting && !confirming && 'is-interacting',
        flipSettled && 'is-revealed-fx',
        confirming && 'is-confirming',
        className,
      )}
      data-tier={tier}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      {/* sparkles만 rotator 안 — 3D 틸트와 동기 */}
      <div className="attack-card-deal__frame">
        <div className="attack-card-deal__translater">
          <div className="attack-card-deal__rotator">
            {tier !== 'S' ? <span className="attack-card-deal__sparkles" aria-hidden /> : null}

            <div
              ref={flipRef}
              className={cn('attack-card-deal__flip', revealed && 'is-revealed')}
            >
              <AttackCardDepth frameOnly showBackplate>
                <div className="attack-card-deal__face attack-card-deal__face--back">{back}</div>
                <div className="attack-card-deal__face attack-card-deal__face--front">{front}</div>
              </AttackCardDepth>
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-disabled={!landed || confirming}
          aria-label={revealed ? '카드 확정' : '카드 뒤집기'}
          tabIndex={landed && !confirming ? 0 : -1}
          onClick={handleCardActivate}
          className={cn('attack-card-deal__hitbox', confirming && 'is-waiting')}
        />
      </div>
    </div>
  );
}
