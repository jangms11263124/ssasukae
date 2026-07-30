'use client';

import { useEffect, useId, useRef, useState } from 'react';

export function RoomHelpFloatingButton() {
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      closeRef.current?.focus();
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      handleClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = panelRef.current?.querySelectorAll<HTMLButtonElement>('button');
    if (!focusables || focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="도움말 열기"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-16 right-6 z-40 grid size-12 place-items-center rounded-full border border-cyan-400/40 bg-[linear-gradient(145deg,#1c1c20,#101012)] text-lg font-semibold text-cyan-200 shadow-[0_8px_30px_rgba(0,0,0,0.5)] transition-colors hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300"
      >
        ?
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
          onKeyDown={handleKeyDown}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleClose();
            }
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md border border-white/10 bg-[linear-gradient(145deg,#1c1c20,#101012)] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between">
              <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
                도움말
              </h2>
              <button
                ref={closeRef}
                type="button"
                aria-label="도움말 닫기"
                onClick={handleClose}
                className="grid size-8 place-items-center border border-white/15 text-sm text-zinc-300 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              >
                ✕
              </button>
            </div>

            {/* 도움말 상세 내용은 별도 이슈에서 작성 예정 */}
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              도움말 내용이 준비 중입니다.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
