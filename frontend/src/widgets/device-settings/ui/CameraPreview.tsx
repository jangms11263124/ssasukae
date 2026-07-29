'use client';

import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

import type { CameraPreviewStatus } from '../model/useCameraPreview';

/**
 * 'off'는 사용자가 프리뷰를 직접 끈 상태로, 스트림을 열 수 없는 'idle'과 구분한다.
 * 둘을 뭉치면 "권한이 없어 못 켠 것"과 "일부러 끈 것"에 같은 안내가 나간다.
 */
export type CameraPreviewViewStatus = CameraPreviewStatus | 'off';

interface CameraPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraPreviewViewStatus;
  errorMessage: string | null;
  isMirrored: boolean;
  onTogglePreview: () => void;
}

const FEED_LABEL: Record<CameraPreviewViewStatus, string> = {
  idle: 'CAM_01_FEED_OFFLINE',
  off: 'CAM_01_FEED_STANDBY',
  starting: 'CAM_01_FEED_SYNCING',
  live: 'CAM_01_FEED_STABLE',
  error: 'CAM_01_FEED_LOST',
};

const PREVIEW_LABEL: Record<CameraPreviewViewStatus, string> = {
  idle: 'PREVIEW: N/A',
  off: 'PREVIEW: OFF',
  starting: 'PREVIEW: SYNC',
  live: 'PREVIEW: LIVE',
  error: 'PREVIEW: ERROR',
};

export function CameraPreview({
  videoRef,
  status,
  errorMessage,
  isMirrored,
  onTogglePreview,
}: CameraPreviewProps) {
  const isLive = status === 'live';
  const isOff = status === 'off';
  // 권한이 없거나 기기가 없으면 켜봐야 열리지 않으므로 토글 자체를 막는다.
  const canToggle = status !== 'idle';

  return (
    <div className="relative mt-6 aspect-video w-full overflow-hidden border border-white/10 bg-black">
      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        aria-label="카메라 프리뷰"
        className={cn(
          'size-full object-cover transition-opacity',
          isLive ? 'opacity-100' : 'opacity-0',
          isMirrored && '-scale-x-100',
        )}
      />

      {!isLive && (
        <div
          className={cn(
            jetBrainsMono.className,
            'absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center',
          )}
        >
          {status === 'starting' && (
            <>
              <span className="size-6 animate-spin rounded-full border border-white/15 border-t-cyan-400" />
              <p className="text-[0.55rem] tracking-[0.14em] text-zinc-500">
                CONNECTING_CAMERA...
              </p>
            </>
          )}

          {isOff && (
            <>
              <p className="text-[0.6rem] tracking-[0.14em] text-zinc-500">[CAMERA_OFF]</p>
              <p className="text-[0.6rem] leading-relaxed tracking-[0.06em] text-zinc-600">
                우측 상단 PREVIEW 배지를 다시 누르면 켜집니다.
              </p>
            </>
          )}

          {(status === 'idle' || status === 'error') && (
            <>
              <p className="text-[0.6rem] tracking-[0.14em] text-fuchsia-400">[NO_VIDEO_SIGNAL]</p>
              <p className="max-w-xs text-[0.6rem] leading-relaxed tracking-[0.06em] text-zinc-500">
                {errorMessage ?? '카메라를 사용할 수 없습니다.'}
              </p>
            </>
          )}
        </div>
      )}

      <span
        className={cn(
          jetBrainsMono.className,
          'absolute left-3 top-3 flex items-center gap-2 border border-white/10 bg-black/70 px-2.5 py-1.5 text-[0.5rem] tracking-[0.12em] text-zinc-300 backdrop-blur-sm',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5',
            isLive ? 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]' : 'bg-zinc-600',
          )}
        />
        {FEED_LABEL[status]}
      </span>

      <button
        type="button"
        onClick={onTogglePreview}
        disabled={!canToggle}
        aria-pressed={isOff}
        title={isOff ? '프리뷰 켜기' : '프리뷰 끄기'}
        className={cn(
          jetBrainsMono.className,
          'absolute right-3 top-3 border bg-black/70 px-2.5 py-1.5 text-[0.5rem] tracking-[0.12em] backdrop-blur-sm transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
          !canToggle && 'cursor-not-allowed border-white/[0.06] text-zinc-700',
          canToggle && 'border-white/10 hover:border-cyan-300/50 hover:text-cyan-200',
          canToggle && (isLive ? 'text-zinc-300' : 'text-zinc-500'),
        )}
      >
        {PREVIEW_LABEL[status]}
      </button>
    </div>
  );
}
