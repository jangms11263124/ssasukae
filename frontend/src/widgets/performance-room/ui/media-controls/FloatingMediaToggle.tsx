'use client';

import { cn } from '@/shared/lib/cn';

interface FloatingMediaToggleProps {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/** 스테이지 하단 중앙에 떠 있는 원형 MIC/CAM 토글 */
export function FloatingMediaToggle({
  icon,
  label,
  on,
  onToggle,
  disabled = false,
}: FloatingMediaToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={`${label} ${on ? '끄기' : '켜기'}`}
      disabled={disabled}
      className={cn(
        'grid size-11 place-items-center rounded-full transition-all',
        on
          ? 'bg-white/90 text-black shadow-[0_2px_12px_rgba(0,0,0,0.35)] hover:bg-white'
          : 'bg-red-500/85 text-white shadow-[0_2px_12px_rgba(220,38,38,0.35)] hover:bg-red-500',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-inherit',
      )}
    >
      {icon}
    </button>
  );
}
