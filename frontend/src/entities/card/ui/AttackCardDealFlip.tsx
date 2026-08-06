'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

import { clamp, round } from '../lib/cardMotionMath';
import { createSpring, SPRING_INTERACT, SPRING_POPOVER } from '../lib/cardSpring';

import './attack-card-deal.css';

interface AttackCardDealFlipProps {
  back: ReactNode;
  className?: string;
  confirming?: boolean;
  front: ReactNode;
  onReady?: () => void;
  onReveal?: () => void;
  onConfirm?: () => void;
  revealed: boolean;
}

const DEAL_READY_FALLBACK_MS = 2000;

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
  onConfirm,
  revealed,
}: AttackCardDealFlipProps) {
  const [landed, setLanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const landedRef = useRef(false);

  // 스프링은 ref에만 보관하고, 렌더에서는 .current를 읽지 않는다.
  const springTranslateRef = useRef(createSpring({ x: 0, y: 0 }, SPRING_POPOVER));
  const springScaleRef = useRef(createSpring(1, SPRING_POPOVER));
  const springRotateDeltaRef = useRef(createSpring({ x: 0, y: 0 }, SPRING_POPOVER));
  const springRotateRef = useRef(createSpring({ x: 0, y: 0 }, SPRING_INTERACT));
  const springGlareRef = useRef(createSpring({ x: 50, y: 50, o: 0 }, SPRING_INTERACT));

  const txRef = useRef(0);
  const tyRef = useRef(0);
  const scaleRef = useRef(1);
  const deltaXRef = useRef(0);
  const deltaYRef = useRef(0);
  const tiltXRef = useRef(0);
  const tiltYRef = useRef(0);
  const glareXRef = useRef(50);
  const glareYRef = useRef(50);
  const glareORef = useRef(0);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const paint = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    root.style.setProperty('--translate-x', `${txRef.current}px`);
    root.style.setProperty('--translate-y', `${tyRef.current}px`);
    root.style.setProperty('--card-scale', String(scaleRef.current));
    root.style.setProperty('--rotate-x', `${tiltXRef.current + deltaXRef.current}deg`);
    root.style.setProperty('--rotate-y', `${tiltYRef.current + deltaYRef.current}deg`);
    root.style.setProperty('--pointer-x', `${glareXRef.current}%`);
    root.style.setProperty('--pointer-y', `${glareYRef.current}%`);
    root.style.setProperty('--card-opacity', String(glareORef.current));
  }, []);

  useEffect(() => {
    const springTranslate = springTranslateRef.current;
    const springScale = springScaleRef.current;
    const springRotateDelta = springRotateDeltaRef.current;
    const springRotate = springRotateRef.current;
    const springGlare = springGlareRef.current;

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
      springGlare.subscribe((v) => {
        glareXRef.current = v.x;
        glareYRef.current = v.y;
        glareORef.current = v.o;
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
    void springScale.set(0.48, { hard: true });
    void springRotateDelta.set({ x: 0, y: 0 }, { hard: true });

    startId = requestAnimationFrame(() => {
      void Promise.all([
        springTranslate.set({ x: 0, y: 0 }),
        springScale.set(1),
        springRotateDelta.set({ x: 360, y: 0 }),
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
  }, []);

  useEffect(() => {
    if (!confirming) return;
    void springRotateRef.current.set({ x: 0, y: 0 }, { hard: true });
    void springGlareRef.current.set({ x: 50, y: 50, o: 0 }, { hard: true });
  }, [confirming]);

  const handlePointerEnter = useCallback(() => {
    if (confirming) return;
    const springRotate = springRotateRef.current;
    const springGlare = springGlareRef.current;
    springRotate.stiffness = SPRING_INTERACT.stiffness;
    springRotate.damping = SPRING_INTERACT.damping;
    springGlare.stiffness = SPRING_INTERACT.stiffness;
    springGlare.damping = SPRING_INTERACT.damping;
  }, [confirming]);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (confirming) return;

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
      const springGlare = springGlareRef.current;
      springRotate.stiffness = SPRING_INTERACT.stiffness;
      springRotate.damping = SPRING_INTERACT.damping;
      springGlare.stiffness = SPRING_INTERACT.stiffness;
      springGlare.damping = SPRING_INTERACT.damping;

      void springRotate.set({
        x: round(-(center.x / 5)),
        y: round(center.y / 5),
      });
      void springGlare.set({
        x: round(percent.x),
        y: round(percent.y),
        o: 1,
      });
    },
    [confirming],
  );

  const resetTilt = useCallback(() => {
    if (confirming) return;
    const springRotate = springRotateRef.current;
    const springGlare = springGlareRef.current;
    springRotate.stiffness = 0.01;
    springRotate.damping = 0.06;
    springGlare.stiffness = 0.01;
    springGlare.damping = 0.06;
    void springRotate.set({ x: 0, y: 0 }, { soft: 1 });
    void springGlare.set({ x: 50, y: 50, o: 0 }, { soft: 1 });
  }, [confirming]);

  const handleCardActivate = () => {
    if (!landed || confirming) return;
    if (!revealed) {
      onReveal?.();
      return;
    }
    onConfirm?.();
  };

  return (
    <div
      ref={rootRef}
      className={cn('attack-card-deal', confirming && 'is-confirming', className)}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      <div className="attack-card-deal__frame">
        <div className="attack-card-deal__translater">
          <div className="attack-card-deal__rotator">
            <div className={cn('attack-card-deal__flip', revealed && 'is-revealed')}>
              <span className="attack-card-deal__core" aria-hidden />
              <span className="attack-card-deal__edge attack-card-deal__edge--left" aria-hidden />
              <span className="attack-card-deal__edge attack-card-deal__edge--right" aria-hidden />
              <span className="attack-card-deal__edge attack-card-deal__edge--top" aria-hidden />
              <span className="attack-card-deal__edge attack-card-deal__edge--bottom" aria-hidden />
              <div className="attack-card-deal__faces">
                <div className="attack-card-deal__face attack-card-deal__face--back">{back}</div>
                <div className="attack-card-deal__face attack-card-deal__face--front">{front}</div>
              </div>
              <span className="attack-card-deal__sheen" aria-hidden />
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
