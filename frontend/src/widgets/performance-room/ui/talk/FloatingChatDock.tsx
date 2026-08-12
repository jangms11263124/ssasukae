'use client';

import { useId, useRef, useState } from 'react';

import { useChatStore } from '../../model/chatStore';
import { TalkPanel } from './TalkPanel';

function ChatIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M21 12a8 8 0 0 1-8 8H4.5l2-2.6A8 8 0 1 1 21 12Z" />
      <path d="M8.5 10.5h7M8.5 13.5h4.5" />
    </svg>
  );
}

function ResizeGripIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      {/* 오른쪽 위로 커지는 창이라 ㄱ자(위·오른쪽 모서리) 브래킷만 그린다 */}
      <path d="M7 7h10v10" />
    </svg>
  );
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  /** 패널이 뷰포트 밖으로 못 나가게 하는 offset 한계 (드래그 시작 시점에 계산) */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** 채팅 창 크기 한계 — 최소는 입력줄·말풍선이 뭉개지지 않는 크기, 최대는 무대를 지키는 크기 */
const PANEL_MIN_WIDTH_PX = 260;
const PANEL_MAX_WIDTH_PX = 560;
const PANEL_MIN_HEIGHT_PX = 240;
/** 키보드(화살표)로 한 번에 움직이는 크기 */
const KEYBOARD_STEP_PX = 16;
/** 조절한 크기를 닫았다 열어도 유지한다 (위치와 달리 크기는 기기별 취향이라 로컬에 둔다) */
const PANEL_SIZE_STORAGE_KEY = 'room:chat-panel-size';

interface PanelSize {
  width: number;
  height: number;
}

/**
 * 크기 한계 적용. 왼쪽·아래 모서리가 고정된 창이라 폭은 화면 오른쪽 끝까지,
 * 높이는 상단 바(약 3.5rem)를 덮기 직전까지만 허용한다.
 */
function clampSize(size: PanelSize, anchor: { left: number; bottom: number }): PanelSize {
  const maxWidth = Math.min(PANEL_MAX_WIDTH_PX, window.innerWidth - anchor.left - 8);
  const maxHeight = anchor.bottom - 60;
  return {
    width: Math.min(Math.max(Math.round(size.width), PANEL_MIN_WIDTH_PX), maxWidth),
    height: Math.min(Math.max(Math.round(size.height), PANEL_MIN_HEIGHT_PX), maxHeight),
  };
}

function readStoredSize(): PanelSize | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(PANEL_SIZE_STORAGE_KEY);
    if (stored === null) return null;
    const [width, height] = stored.split('x').map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

    // 저장 시점과 화면 크기가 달라졌을 수 있으니 기본 자리(left 1rem, bottom 6.25rem) 기준으로 다시 자른다.
    return clampSize({ width, height }, { left: 16, bottom: window.innerHeight - 100 });
  } catch {
    // 시크릿 모드 등 localStorage 접근이 막힌 환경 — 저장 없이 동작한다.
    return null;
  }
}

function writeStoredSize(size: PanelSize | null) {
  try {
    if (size === null) {
      window.localStorage.removeItem(PANEL_SIZE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(PANEL_SIZE_STORAGE_KEY, `${size.width}x${size.height}`);
    }
  } catch {
    /* 저장 실패는 조절 자체를 막지 않는다 */
  }
}

interface ResizeState {
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  /** 크기가 변해도 움직이지 않는 왼쪽·아래 모서리 — 한계 계산용 (시작 시점에 고정) */
  left: number;
  bottom: number;
}

interface ChatPanelWindowProps {
  panelId: string;
  onClose: () => void;
}

/**
 * 열려 있는 동안의 채팅 창. 헤더를 잡아 원하는 위치로 끌 수 있고, 오른쪽 위
 * 모서리 손잡이로 크기를 조절할 수 있다. 위치는 닫으면 기본 자리로 돌아오지만
 * 크기는 localStorage에 남아 유지된다.
 */
function ChatPanelWindow({ panelId, onClose }: ChatPanelWindowProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState<PanelSize | null>(readStoredSize);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  // window가 아니라 패널 자신의 keydown만 듣는다 — 곡 검색 모달 등 다른 레이어의
  // Escape에 채팅이 함께 닫혀 초안이 날아가는 걸 막는다.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    // 한글 IME 조합 취소용 Esc(isComposing)는 패널을 닫지 않는다.
    if (event.nativeEvent.isComposing) return;
    event.stopPropagation();
    onClose();
  };

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    // 헤더의 닫기 버튼에서 시작한 포인터는 드래그가 아니라 클릭이다.
    if ((event.target as HTMLElement).closest('button') !== null) return;
    const panel = panelRef.current;
    if (panel === null) return;

    const rect = panel.getBoundingClientRect();
    // 지금 offset을 뺀 값이 기본 자리 — 한계는 기본 자리 기준으로 계산한다.
    const baseLeft = rect.left - offset.x;
    const baseTop = rect.top - offset.y;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: offset.x,
      baseY: offset.y,
      minX: 8 - baseLeft,
      maxX: window.innerWidth - rect.width - 8 - baseLeft,
      minY: 8 - baseTop,
      maxY: window.innerHeight - rect.height - 8 - baseTop,
    };
    // 핸들 밖으로 빠르게 끌어도 move/up을 계속 받도록 포인터를 붙잡는다.
    // (활성 포인터가 없으면 던지는 브라우저가 있어 실패는 무시한다)
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
  };

  const handleDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: Math.min(Math.max(drag.baseX + event.clientX - drag.startX, drag.minX), drag.maxX),
      y: Math.min(Math.max(drag.baseY + event.clientY - drag.startY, drag.minY), drag.maxY),
    });
  };

  const handleDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  };

  const resetSize = () => {
    setSize(null);
    writeStoredSize(null);
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (panel === null) return;

    const rect = panel.getBoundingClientRect();
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      left: rect.left,
      bottom: rect.bottom,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
  };

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (resize === null || resize.pointerId !== event.pointerId) return;
    // 오른쪽으로 끌면 넓어지고 위로 끌면 길어진다 (왼쪽·아래 모서리 고정).
    setSize(
      clampSize(
        {
          width: resize.startWidth + event.clientX - resize.startX,
          height: resize.startHeight - (event.clientY - resize.startY),
        },
        resize,
      ),
    );
  };

  const handleResizeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    // 드래그 중에는 상태만 바꾸고, 손을 뗄 때 실측 크기를 한 번 저장한다.
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect !== undefined) {
      writeStoredSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    }
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      resetSize();
      return;
    }

    const deltas: Record<string, readonly [number, number]> = {
      ArrowRight: [KEYBOARD_STEP_PX, 0],
      ArrowLeft: [-KEYBOARD_STEP_PX, 0],
      ArrowUp: [0, KEYBOARD_STEP_PX],
      ArrowDown: [0, -KEYBOARD_STEP_PX],
    };
    const delta = deltas[event.key];
    const panel = panelRef.current;
    if (delta === undefined || panel === null) return;

    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const next = clampSize({ width: rect.width + delta[0], height: rect.height + delta[1] }, rect);
    setSize(next);
    writeStoredSize(next);
  };

  return (
    <div
      id={panelId}
      ref={panelRef}
      role="dialog"
      aria-label="채팅"
      onKeyDown={handleKeyDown}
      style={{
        ...(offset.x !== 0 || offset.y !== 0
          ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
          : undefined),
        // 크기를 조절한 적이 있으면 그 값이 기본 클래스(w-80, h-[…])를 이긴다.
        ...(size !== null ? { width: size.width, height: size.height } : undefined),
      }}
      // 채팅 버튼(bottom 3~5.75rem) 위에서 시작하고, 위로는 상단 바(약 3.5rem)를
      // 넘보지 않는 높이만 쓴다 — 낮은 해상도에서도 헤더를 덮지 않는다.
      className="fixed bottom-[6.25rem] left-4 z-50 flex h-[min(30rem,calc(100dvh-10rem))] w-80 max-w-[calc(100vw-2rem)] flex-col"
    >
      <TalkPanel
        onClose={onClose}
        dragHandleProps={{
          onPointerDown: handleDragStart,
          onPointerMove: handleDragMove,
          onPointerUp: handleDragEnd,
          onPointerCancel: handleDragEnd,
        }}
      />

      {/* 크기 조절 손잡이. 왼쪽·아래가 고정된 창이라 오른쪽 위 모서리에서 끈다 */}
      <div
        role="separator"
        aria-label="채팅 창 크기 조절"
        title="드래그로 크기 조절 · 더블클릭으로 초기화"
        tabIndex={0}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onDoubleClick={resetSize}
        onKeyDown={handleResizeKeyDown}
        className="absolute -right-1 -top-1 grid size-5 cursor-nesw-resize touch-none place-items-center text-zinc-400 transition-colors hover:text-cyan-200 focus-visible:text-cyan-200 focus-visible:outline-none"
      >
        <ResizeGripIcon />
      </div>
    </div>
  );
}

/**
 * 왼쪽 하단 플로팅 채팅. 버튼을 누르면 위로 패널이 열리고, 닫혀 있는 동안
 * 새 메시지가 오면 빨간 점이 뜬다. 무대(가사)를 가리지 않도록 상시 노출하지 않는다.
 */
export function FloatingChatDock() {
  const isPanelOpen = useChatStore((state) => state.isPanelOpen);
  const unreadCount = useChatStore((state) => state.unreadCount);
  const openPanel = useChatStore((state) => state.openPanel);
  const closePanel = useChatStore((state) => state.closePanel);

  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 패널을 닫으면 포커스를 열었던 버튼으로 되돌린다 (도움말 버튼과 같은 규칙).
  const handleClose = () => {
    closePanel();
    triggerRef.current?.focus();
  };

  const hasUnread = unreadCount > 0;

  return (
    <>
      {isPanelOpen ? <ChatPanelWindow panelId={panelId} onClose={handleClose} /> : null}

      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isPanelOpen}
        aria-haspopup="dialog"
        aria-controls={isPanelOpen ? panelId : undefined}
        aria-label={
          isPanelOpen
            ? '채팅 닫기'
            : hasUnread
              ? `채팅 열기 (안 읽은 메시지 ${unreadCount}개)`
              : '채팅 열기'
        }
        onClick={isPanelOpen ? handleClose : openPanel}
        className="fixed bottom-12 left-4 z-40 grid size-11 place-items-center rounded-full border border-cyan-400/40 bg-[linear-gradient(145deg,#1c1c20,#101012)] text-cyan-200 shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-colors hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300"
      >
        <ChatIcon />
        {hasUnread && !isPanelOpen ? (
          <span
            aria-hidden="true"
            className="absolute right-0 top-0 size-3 rounded-full border-2 border-[#0b0b0d] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
          />
        ) : null}
      </button>
    </>
  );
}
