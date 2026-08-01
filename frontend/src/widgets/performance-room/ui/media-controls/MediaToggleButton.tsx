'use client';

import { cn } from '@/shared/lib/cn';

interface MediaToggleButtonProps {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onToggle: () => void;
  /**
   * ON/OFF 문구 표시 여부.
   * 창을 여닫는 버튼처럼 켜짐/꺼짐이라는 표현이 어색한 경우 끈다.
   */
  showState?: boolean;
  disabled?: boolean;
  className?: string;
}

// 좌측 MIC/CAM/GESTURE와 우측 DSP가 함께 쓰는 무대 토글의 공통 모양.
export function MediaToggleButton({
  icon,
  label,
  on,
  onToggle,
  showState = true,
  disabled = false,
  className,
}: MediaToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 border bg-black/60 px-3 py-1.5 font-mono text-xs leading-none tracking-[0.18em] transition-colors',
        on
          ? 'border-cyan-300/80 text-cyan-100'
          : 'border-white/25 text-zinc-500 hover:text-zinc-300',
        disabled && 'cursor-not-allowed border-white/10 text-zinc-700 hover:text-zinc-700',
        className,
      )}
    >
      {icon}
      {showState ? `${label} ${on ? 'ON' : 'OFF'}` : label}
    </button>
  );
}
