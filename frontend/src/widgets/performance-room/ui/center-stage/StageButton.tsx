import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';

interface StageButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  size?: 'lg' | 'md' | 'sm';
}

export function StageButton({
  className,
  selected = false,
  size = 'md',
  type = 'button',
  ...props
}: StageButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'border bg-white/5 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'lg' && 'min-w-80 px-8 py-4 text-lg',
        size === 'md' && 'min-w-40 px-8 py-3 text-base',
        size === 'sm' && 'min-w-24 px-5 py-2.5 text-sm',
        selected
          ? 'border-cyan-300 text-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.25)]'
          : 'border-white/60 hover:border-cyan-300/70 hover:text-cyan-100',
        className,
      )}
      {...props}
    />
  );
}
