'use client';

import { useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';

/** 레일 폭 조절 한계. 최소는 카드+캠이 뭉개지지 않는 폭, 최대는 무대를 지키는 폭 */
const RAIL_MIN_PX = 216;
const RAIL_MAX_PX = 480;
/** 키보드(화살표)로 한 번에 움직이는 폭 */
const KEYBOARD_STEP_PX = 16;
/** 조절한 폭을 새로고침·재입장 뒤에도 유지한다 (기기별 취향이라 서버가 아닌 로컬에 둔다) */
const RAIL_WIDTH_STORAGE_KEY = 'room:cam-rail-width';

function readStoredWidth(): number | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY);
    if (stored === null) return null;
    const parsed = Number(stored);
    // 저장된 값이 손상됐거나 한계 밖이면 기본 폭으로 되돌린다.
    if (!Number.isFinite(parsed) || parsed < RAIL_MIN_PX || parsed > RAIL_MAX_PX) return null;

    return Math.round(parsed);
  } catch {
    // 시크릿 모드 등 localStorage 접근이 막힌 환경 — 저장 없이 동작한다.
    return null;
  }
}

function writeStoredWidth(width: number | null) {
  if (typeof window === 'undefined') return;

  try {
    if (width === null) {
      window.localStorage.removeItem(RAIL_WIDTH_STORAGE_KEY);
    } else {
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(width));
    }
  } catch {
    /* 저장 실패는 조절 자체를 막지 않는다 */
  }
}

/**
 * 저장된 폭을 외부 스토어로 읽는다. useState 초기값으로 localStorage를 읽으면
 * 서버 렌더 결과와 어긋나므로(hydration mismatch), 서버에서는 null을 주고
 * 하이드레이션 후 저장값으로 넘어가는 useSyncExternalStore 패턴을 쓴다.
 */
let cachedWidth: number | null | undefined;
const widthListeners = new Set<() => void>();

function subscribeWidth(listener: () => void) {
  widthListeners.add(listener);
  return () => {
    widthListeners.delete(listener);
  };
}

function getWidthSnapshot(): number | null {
  if (cachedWidth === undefined) {
    cachedWidth = readStoredWidth();
  }

  return cachedWidth;
}

function getWidthServerSnapshot(): number | null {
  return null;
}

function setStoredWidth(width: number | null) {
  cachedWidth = width;
  writeStoredWidth(width);
  widthListeners.forEach((listener) => listener());
}

interface DragState {
  pointerId: number;
  startX: number;
  startWidth: number;
}

function clampWidth(next: number): number {
  const max = Math.min(RAIL_MAX_PX, Math.round(window.innerWidth * 0.45));
  return Math.min(Math.max(Math.round(next), RAIL_MIN_PX), max);
}

/**
 * 참가자 캠 레일 + 폭 조절 핸들(데스크톱 전용). 핸들을 끌면 레일만 넓어지거나
 * 좁아지고, 내부 캠·카드는 비율 기반이라 폭을 따라 함께 커진다.
 * 조절한 폭은 localStorage에 남아 새로고침·재입장 뒤에도 유지되고,
 * 더블클릭(또는 Home 키)으로 기본 폭으로 되돌리면 저장값도 지워진다.
 */
export function ResizableCamRail({ children }: { children: ReactNode }) {
  const width = useSyncExternalStore(subscribeWidth, getWidthSnapshot, getWidthServerSnapshot);
  const setWidth = setStoredWidth;
  const asideRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const aside = asideRef.current;
    if (aside === null) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: aside.getBoundingClientRect().width,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 활성 포인터가 없으면 던지는 브라우저가 있어 무시한다 */
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;

    const aside = asideRef.current;
    if (aside === null) return;
    const currentWidth = aside.getBoundingClientRect().width;
    let next = clampWidth(drag.startWidth + event.clientX - drag.startX);

    // 늘리는 방향의 추가 한계: 폭이 커지면 타일이 세로로 길어져 카드·캠이 레일 높이를
    // 넘칠 수 있다. 스트립이 이미 넘쳐(스크롤 발생) 있으면 더 늘리지 않고, 넘침 검사가
    // 렌더 한 박자 뒤라 빠른 드래그가 한계를 지나치지 않도록 증가폭도 이벤트당 제한한다.
    if (next > currentWidth) {
      const strip = aside.querySelector('[aria-label="참가자 캠 화면"]');
      if (strip !== null && strip.scrollHeight > strip.clientHeight + 1) return;
      next = Math.min(next, Math.round(currentWidth) + 24);
    }

    setWidth(next);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const aside = asideRef.current;
    if (aside === null) return;
    const current = aside.getBoundingClientRect().width;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (event.key === 'ArrowRight') {
        // 드래그와 같은 한계 — 스트립이 넘쳐 있으면 더 늘리지 않는다.
        const strip = aside.querySelector('[aria-label="참가자 캠 화면"]');
        if (strip !== null && strip.scrollHeight > strip.clientHeight + 1) return;
      }
      const delta = event.key === 'ArrowLeft' ? -KEYBOARD_STEP_PX : KEYBOARD_STEP_PX;
      setWidth(clampWidth(current + delta));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setWidth(null);
    }
  };

  return (
    <>
      <aside
        ref={asideRef}
        aria-label="참가자 캠 레일"
        // 조절 전에는 브레이크포인트 기본 폭(19/21rem), 조절하면 --rail-w가 이긴다.
        style={width !== null ? ({ '--rail-w': `${width}px` } as CSSProperties) : undefined}
        // 레일 폭을 기준(cqw)으로 삼아, 안쪽 카드가 레일 밖으로 넘치지 않게 상한을 건다.
        className="peer order-2 min-h-0 shrink-0 [container-type:inline-size] empty:hidden lg:order-1 lg:flex lg:w-[var(--rail-w,19rem)] lg:flex-col xl:w-[var(--rail-w,21rem)]"
      >
        {children}
      </aside>

      {/*
        폭 조절 핸들. 레일이 비어 사라지면(empty) 같이 숨는다.
        음수 마진이 main의 gap-3을 상쇄해, 핸들이 있어도 레일-무대 간격은 12px 그대로다.
      */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="캠 레일 폭 조절"
        aria-valuemin={RAIL_MIN_PX}
        aria-valuemax={RAIL_MAX_PX}
        aria-valuenow={width ?? undefined}
        title="드래그로 폭 조절 · 더블클릭으로 초기화"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={() => setWidth(null)}
        onKeyDown={handleKeyDown}
        className="group hidden touch-none peer-empty:hidden lg:order-1 lg:-mx-[9px] lg:flex lg:w-1.5 lg:shrink-0 lg:cursor-col-resize lg:items-center lg:justify-center lg:rounded-full lg:bg-white/5 lg:transition-colors lg:hover:bg-cyan-400/30 lg:active:bg-cyan-400/50 lg:focus-visible:bg-cyan-400/30 lg:focus-visible:outline-none"
      >
        {/* 가운데 손잡이 — 여기가 끌 수 있는 곳임을 보여준다 */}
        <span
          aria-hidden="true"
          className="h-12 w-[3px] rounded-full bg-white/30 transition-colors group-hover:bg-cyan-200 group-active:bg-cyan-100"
        />
      </div>
    </>
  );
}
