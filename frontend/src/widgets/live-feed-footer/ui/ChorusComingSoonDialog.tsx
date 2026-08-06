'use client';

import { useEffect, useId, useRef } from 'react';

interface ChorusComingSoonDialogProps {
  onClose: () => void;
}

/** 합창 모드 연동 전까지 노출하는 준비중 안내 모달. */
export function ChorusComingSoonDialog({ onClose }: ChorusComingSoonDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-sm border border-white/10 bg-[linear-gradient(145deg,#1c1c20,#101012)] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
          합창 모드
        </h2>
        <p id={descriptionId} className="mt-3 text-sm leading-relaxed text-zinc-400">
          아직 준비중입니다. 조금만 기다려 주세요!
        </p>
        <div className="mt-6 flex justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200 transition-colors hover:bg-cyan-400/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
