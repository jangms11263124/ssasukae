'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/lib/cn';

interface RoomHeaderPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  contentClassName?: string;
  onClose: () => void;
  open: boolean;
  title?: string;
  widthClass?: string;
}

/** 헤더 버튼 바로 아래에 뜨는 작은 드롭다운 */
export function RoomHeaderPopover({
  anchorRef,
  children,
  contentClassName,
  onClose,
  open,
  title,
  widthClass = 'w-72',
}: RoomHeaderPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, onClose, anchorRef, updatePosition]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      className={cn(
        'fixed z-50 overflow-hidden rounded-lg border border-white/10 bg-[#141416] shadow-[0_12px_40px_rgba(0,0,0,0.55)]',
        widthClass,
      )}
      style={{ top: position.top, right: position.right }}
    >
      {title ? (
        <div className="border-b border-white/10 px-3 py-2">
          <p className="text-xs font-medium text-zinc-300">{title}</p>
        </div>
      ) : null}
      <div className={cn('overflow-y-auto', contentClassName)}>{children}</div>
    </div>,
    document.body,
  );
}
