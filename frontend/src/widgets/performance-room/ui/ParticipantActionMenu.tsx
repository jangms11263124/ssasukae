'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { SixDotsIcon } from './SixDotsIcon';

/** RoomHeaderPopover 등 overflow 컨테이너 밖 클릭 무시용 */
export const PARTICIPANT_ACTION_MENU_ATTR = 'data-participant-action-menu';

interface ParticipantActionMenuProps {
  isOpen: boolean;
  nickname: string;
  onClose: () => void;
  onDelegateHost: () => void;
  onKickParticipant: () => void;
  onToggle: () => void;
}

const MENU_WIDTH_PX = 112; // w-28
const MENU_OFFSET_PX = 4;

export function ParticipantActionMenu({
  isOpen,
  nickname,
  onClose,
  onDelegateHost,
  onKickParticipant,
  onToggle,
}: ParticipantActionMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) {
      setMenuPos(null);
      return;
    }

    function updatePosition() {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + MENU_OFFSET_PX,
        left: rect.right - MENU_WIDTH_PX,
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

    firstItemRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    items[(currentIndex + delta + items.length) % items.length]?.focus();
  };

  const menu =
    isOpen && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            {...{ [PARTICIPANT_ACTION_MENU_ATTR]: '' }}
            role="menu"
            aria-label={`${nickname} 참가자 관리 메뉴`}
            onKeyDown={handleMenuKeyDown}
            className="fixed z-[60] w-28 border border-white/10 bg-[#18181b] py-1 shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button
              ref={firstItemRef}
              type="button"
              role="menuitem"
              onClick={onDelegateHost}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-cyan-200 focus-visible:bg-white/5 focus-visible:text-cyan-200 focus-visible:outline-none"
            >
              방장 위임
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={onKickParticipant}
              className="block w-full px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:bg-red-500/10 focus-visible:text-red-300 focus-visible:outline-none"
            >
              강퇴
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${nickname} 참가자 관리`}
        className="grid size-6 place-items-center text-zinc-500 transition-colors hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300"
      >
        <SixDotsIcon />
      </button>

      {menu}
    </div>
  );
}
