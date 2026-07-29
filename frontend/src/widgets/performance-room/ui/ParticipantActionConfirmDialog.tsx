'use client';

import { useEffect, useId, useRef } from 'react';

import { cn } from '@/shared/lib/cn';

export type ParticipantActionType = 'delegate' | 'kick';

interface ParticipantActionConfirmDialogProps {
  action: ParticipantActionType;
  nickname: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const DIALOG_COPY = {
  delegate: {
    confirmLabel: '위임하기',
    message: (nickname: string) =>
      `${nickname} 님에게 방장을 위임하시겠습니까? 위임하면 나의 참가자 관리 권한이 사라집니다.`,
    title: '방장 위임',
  },
  kick: {
    confirmLabel: '강퇴하기',
    message: (nickname: string) =>
      `${nickname} 님을 방에서 강퇴하시겠습니까? 강퇴된 참가자는 목록에서 제거됩니다.`,
    title: '참가자 강퇴',
  },
} as const;

export function ParticipantActionConfirmDialog({
  action,
  nickname,
  onCancel,
  onConfirm,
}: ParticipantActionConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const copy = DIALOG_COPY[action];

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4"
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-sm border border-white/10 bg-[linear-gradient(145deg,#1c1c20,#101012)] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-100">
          {copy.title}
        </h2>
        <p id={descriptionId} className="mt-3 text-sm leading-relaxed text-zinc-400">
          {copy.message(nickname)}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="border border-white/15 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'border px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1',
              action === 'kick'
                ? 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 focus-visible:ring-red-400'
                : 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20 focus-visible:ring-cyan-300',
            )}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
