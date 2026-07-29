'use client';

import { useEffect, useRef } from 'react';

import { SixDotsIcon } from './SixDotsIcon';

interface ParticipantActionMenuProps {
  isOpen: boolean;
  nickname: string;
  onClose: () => void;
  onDelegateHost: () => void;
  onKickParticipant: () => void;
  onToggle: () => void;
}

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
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    firstItemRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
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

      {isOpen ? (
        <div
          role="menu"
          aria-label={`${nickname} 참가자 관리 메뉴`}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-1 w-28 border border-white/10 bg-[#18181b] py-1 shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
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
        </div>
      ) : null}
    </div>
  );
}
