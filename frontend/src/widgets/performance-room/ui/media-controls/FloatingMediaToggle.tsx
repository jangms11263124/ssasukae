'use client';

import { cn } from '@/shared/lib/cn';

interface FloatingMediaToggleProps {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** 잠긴 이유. 툴팁과 aria-label로 안내한다 — 눌러도 안 되는 이유를 알 수 있어야 한다 */
  disabledReason?: string;
}

/** 스테이지 하단 중앙에 떠 있는 원형 MIC/CAM 토글 */
export function FloatingMediaToggle({
  icon,
  label,
  on,
  onToggle,
  disabled = false,
  disabledReason,
}: FloatingMediaToggleProps) {
  const lockedLabel = disabled && disabledReason !== undefined;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={lockedLabel ? `${label} — ${disabledReason}` : `${label} ${on ? '끄기' : '켜기'}`}
      title={lockedLabel ? disabledReason : undefined}
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
