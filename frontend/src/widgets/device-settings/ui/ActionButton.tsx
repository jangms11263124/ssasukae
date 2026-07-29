'use client';

import { cn } from '@/shared/lib/cn';

/**
 * 설정 화면의 버튼은 크기·자간을 한곳에서 관리해 카드마다 어긋나지 않게 한다.
 * 흰 배경(primary)은 페이지 단위 확정 동작인 SAVE CHANGES 하나에만 쓴다.
 */
type ActionButtonVariant = 'primary' | 'secondary';

const VARIANT_CLASS: Record<ActionButtonVariant, string> = {
  primary:
    'bg-white text-black hover:bg-cyan-200 disabled:bg-white/15 disabled:text-zinc-500',
  secondary:
    'border border-white/10 bg-white/[0.02] text-zinc-200 hover:border-cyan-300/50 hover:bg-cyan-300/[0.05] hover:text-cyan-200 disabled:border-white/[0.06] disabled:text-zinc-600',
};

interface ActionButtonProps extends Omit<React.ComponentProps<'button'>, 'className' | 'type'> {
  variant?: ActionButtonVariant;
  className?: string;
}

export function ActionButton({
  variant = 'secondary',
  className,
  children,
  ...buttonProps
}: ActionButtonProps) {
  return (
    <button
      type="button"
      {...buttonProps}
      className={cn(
        'flex h-11 items-center justify-center gap-2.5 text-[0.66rem] font-bold tracking-[0.14em] transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
        'disabled:cursor-not-allowed',
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
