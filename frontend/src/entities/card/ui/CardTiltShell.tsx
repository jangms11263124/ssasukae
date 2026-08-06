'use client';

import { useCallback, useRef, type PointerEvent, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

import { AttackCardDepth } from './AttackCardDepth';

import './attack-card-tilt.css';

interface CardTiltShellProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  /** 최대 기울기(deg). 기본 5 */
  tiltMax?: number;
}

/**
 * 포인터 틸트 셸.
 * perspective(바깥) / transform(안쪽) 분리 + 두께 메시.
 */
export function CardTiltShell({
  children,
  className,
  interactive = true,
  tiltMax = 5,
}: CardTiltShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );

  const setTilt = useCallback((rx: number, ry: number) => {
    const plane = planeRef.current;
    if (!plane) return;
    plane.style.setProperty('--tilt-x', `${rx.toFixed(2)}deg`);
    plane.style.setProperty('--tilt-y', `${ry.toFixed(2)}deg`);
  }, []);

  const ensureRect = useCallback((el: HTMLDivElement) => {
    if (rectRef.current) return;
    const rect = el.getBoundingClientRect();
    rectRef.current = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  const handlePointerEnter = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!interactive) return;
      rectRef.current = null;
      ensureRect(event.currentTarget);
      event.currentTarget.dataset.tilting = 'true';
    },
    [ensureRect, interactive],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!interactive) return;
      ensureRect(event.currentTarget);
      const rect = rectRef.current;
      if (!rect || rect.width === 0 || rect.height === 0) return;

      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      setTilt(-py * 2 * tiltMax, px * 2 * tiltMax);
    },
    [ensureRect, interactive, setTilt, tiltMax],
  );

  const reset = useCallback(() => {
    rectRef.current = null;
    const root = rootRef.current;
    if (root) root.dataset.tilting = 'false';
    setTilt(0, 0);
  }, [setTilt]);

  if (!interactive) {
    return <div className={cn('size-full', className)}>{children}</div>;
  }

  return (
    <div
      ref={rootRef}
      className={cn('attack-card-tilt', className)}
      data-tilting="false"
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      <div ref={planeRef} className="attack-card-tilt__plane">
        <AttackCardDepth>{children}</AttackCardDepth>
      </div>
    </div>
  );
}
