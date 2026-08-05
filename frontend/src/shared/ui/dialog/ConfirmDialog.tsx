'use client';

import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { ActionButton } from '@/shared/ui/button/ActionButton';

interface ConfirmDialogProps {
  cancelLabel?: string;
  confirmLabel: string;
  /** 되돌릴 수 없는 동작이면 확인 버튼을 위험 스타일로 표시한다 */
  danger?: boolean;
  description?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  /** 확인 동작 진행 중 — 버튼을 잠가 중복 실행과 닫힘을 막는다 */
  pending?: boolean;
  title: string;
}

/** 화면 중앙 확인 모달. 되돌리기 어려운 동작 앞에서 한 번 더 묻는다 */
export function ConfirmDialog({
  cancelLabel = '취소',
  confirmLabel,
  danger = false,
  description,
  onCancel,
  onConfirm,
  open,
  pending = false,
  title,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, pending, onCancel]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full max-w-sm rounded-lg border border-white/10 bg-[#141416] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
      >
        <div className="border-b border-white/10 px-5 py-2.5">
          <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-500">
            SYSTEM / CONFIRM
          </p>
        </div>

        <div className="space-y-2 px-5 pt-5 pb-4">
          <h2 id={titleId} className="text-base font-semibold text-zinc-100">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-sm leading-relaxed text-zinc-400">
              {description}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 pb-5">
          <ActionButton autoFocus disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </ActionButton>
          <ActionButton
            variant={danger ? 'danger' : 'primary'}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
