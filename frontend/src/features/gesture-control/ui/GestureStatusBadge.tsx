import { cn } from '@/shared/lib/cn';

interface GestureStatusBadgeProps {
  /** 제스처 기능이 켜져 있는지. OFF면 배지를 숨긴다 (토글 UI가 이미 상태를 보여줌) */
  enabled: boolean;
  /** MediaPipe 스크립트 로드 완료 */
  isReady: boolean;
  isHandDetected: boolean;
  error: string | null;
  className?: string;
}

interface StatusView {
  label: string;
  tone: string;
  dot: string;
}

/** 손이 없는 상태는 사용자가 이미 아는 상황이라, 알려줄 것이 있을 때만 배지를 띄운다. */
function resolveStatus(
  isReady: boolean,
  isHandDetected: boolean,
  error: string | null,
): StatusView | null {
  if (error !== null) {
    return {
      label: `제스처 오류 · ${error}`,
      tone: 'border-[#ff3b30]/70 bg-black/80 text-[#ff8078] shadow-[0_0_18px_rgba(255,59,48,0.35)]',
      dot: 'bg-[#ff3b30] shadow-[0_0_8px_#ff3b30]',
    };
  }
  if (!isReady) {
    return {
      label: '제스처 준비 중',
      tone: 'border-white/25 bg-black/80 text-zinc-300',
      dot: 'bg-zinc-400 animate-pulse',
    };
  }
  if (!isHandDetected) {
    return null;
  }

  return {
    label: '제스처 인식 중',
    tone: 'border-cyan-300 bg-black/80 text-cyan-200 shadow-[0_0_18px_rgba(0,243,255,0.45)]',
    dot: 'bg-cyan-300 shadow-[0_0_8px_#00f3ff]',
  };
}

export function GestureStatusBadge({
  enabled,
  isReady,
  isHandDetected,
  error,
  className,
}: GestureStatusBadgeProps) {
  const status = enabled ? resolveStatus(isReady, isHandDetected, error) : null;

  if (status === null) return null;

  return (
    <span
      // 밝은 캠 영상 위에 얹히므로 배경을 어둡게 하고 글자에도 그림자를 준다.
      className={cn(
        'pointer-events-none inline-flex items-center gap-2 rounded-full border-[1.5px] px-3 py-1.5 font-mono text-[11px] font-bold leading-none tracking-[0.16em] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-colors',
        status.tone,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', status.dot)} />
      {status.label}
    </span>
  );
}
