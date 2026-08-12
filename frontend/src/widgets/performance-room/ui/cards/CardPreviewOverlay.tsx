'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface CardPreviewOverlayProps {
  ariaLabel: string;
  onClose: () => void;
  /** 카드 면. 배분 연출처럼 툭 튀어나오는 등장 애니메이션이 붙는다 */
  children: ReactNode;
  /** 카드 아래 버튼 줄 */
  actions: ReactNode;
  /** 카드와 버튼 사이의 안내 문구 */
  caption?: ReactNode;
}

/**
 * 카드 확인 오버레이 공용 셸. 화면 중앙에 카드를 크게 띄우고,
 * Escape·배경 클릭으로 닫는다 — 내 카드 확정과 상대 카드 엿보기가 함께 쓴다.
 */
export function CardPreviewOverlay({
  ariaLabel,
  onClose,
  children,
  actions,
  caption,
}: CardPreviewOverlayProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-black/75 px-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="[animation:card-preview-pop_0.35s_ease-out_both]">{children}</div>

      {caption ? (
        <p className="max-w-[26rem] break-keep text-center text-sm leading-relaxed text-zinc-300 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
          {caption}
        </p>
      ) : null}

      <div className="flex gap-2">{actions}</div>
    </div>,
    document.body,
  );
}
