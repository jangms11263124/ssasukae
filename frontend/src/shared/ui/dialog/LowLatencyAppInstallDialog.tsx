'use client';

import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

import {
  LOW_LATENCY_APP_DOWNLOAD_URL,
  LOW_LATENCY_APP_FILE_NAME,
} from '@/shared/lib/launchLowLatencyApp';
import { ActionButton } from '@/shared/ui/button/ActionButton';

interface LowLatencyAppInstallDialogProps {
  /** 닫기 버튼 문구. 방을 정리하고 닫는 화면에서는 그 사실을 드러낸다 */
  closeLabel?: string;
  onClose: () => void;
  onRetry: () => void;
  open: boolean;
}

/**
 * ssafystar:// 딥링크로 앱 전환을 확인하지 못했을 때 띄우는 설치 안내 모달.
 * 합창 모드 진입 지점(방 만들기·방 참여·합창하러 가기)이 공유한다.
 */
export function LowLatencyAppInstallDialog({
  closeLabel = '닫기',
  onClose,
  onRetry,
  open,
}: LowLatencyAppInstallDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-lg border border-white/10 bg-[#141416] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
      >
        <div className="border-b border-white/10 px-5 py-2.5">
          <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-500">
            LOW LATENCY AUDIO / WINDOWS
          </p>
        </div>

        <div className="space-y-2 px-5 pt-5 pb-4">
          <h2 id={titleId} className="text-base font-semibold text-zinc-100">
            전용 오디오 앱이 필요합니다
          </h2>
          <p id={descriptionId} className="break-keep text-sm leading-relaxed text-zinc-400">
            앱 실행을 확인하지 못했습니다. 설치 파일을 실행하면 합창 모드용 앱과 ssafystar://
            연결이 함께 등록됩니다.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5">
          <ActionButton onClick={onRetry}>이미 설치함 · 다시 실행</ActionButton>
          <a
            href={LOW_LATENCY_APP_DOWNLOAD_URL}
            download={LOW_LATENCY_APP_FILE_NAME}
            className="flex h-11 items-center justify-center gap-2.5 bg-white text-[0.66rem] font-bold tracking-[0.14em] text-black transition-colors hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            앱 다운로드
          </a>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full px-5 py-4 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          {closeLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
