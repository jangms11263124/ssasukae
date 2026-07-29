'use client';

import { cn } from '@/shared/lib/cn';

interface RecordingProgressBarProps {
  isRecording: boolean;
  remainingMs: number;
  totalMs: number;
}

/**
 * 녹음 남은 시간을 숫자 대신 막대로 보여준다.
 * 녹음이 아닐 때도 트랙 높이를 유지해 시작·종료 시 레이아웃이 흔들리지 않게 한다.
 */
export function RecordingProgressBar({
  isRecording,
  remainingMs,
  totalMs,
}: RecordingProgressBarProps) {
  return (
    <div
      className={cn('mt-3 h-0.5 w-full transition-colors', isRecording && 'bg-white/[0.07]')}
      role={isRecording ? 'progressbar' : undefined}
      aria-label={isRecording ? '녹음 남은 시간' : undefined}
      aria-valuemin={isRecording ? 0 : undefined}
      aria-valuemax={isRecording ? totalMs : undefined}
      aria-valuenow={isRecording ? Math.round(remainingMs) : undefined}
    >
      {isRecording && (
        <div
          className="h-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]"
          style={{ width: `${(remainingMs / totalMs) * 100}%` }}
        />
      )}
    </div>
  );
}
