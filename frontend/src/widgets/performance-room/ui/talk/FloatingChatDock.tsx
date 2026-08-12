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

interface ChatPanelWindowProps {
  panelId: string;
  onClose: () => void;
}

/**
 * 열려 있는 동안의 채팅 창. 헤더를 잡아 원하는 위치로 끌 수 있고,
 * 위치 상태가 이 컴포넌트에 살아서 닫았다 다시 열면 기본 자리로 돌아온다.
 */
function ChatPanelWindow({ panelId, onClose }: ChatPanelWindowProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

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

  return (
    <div
      id={panelId}
      ref={panelRef}
      role="dialog"
      aria-label="채팅"
      onKeyDown={handleKeyDown}
      style={
        offset.x !== 0 || offset.y !== 0
          ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
          : undefined
      }
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
