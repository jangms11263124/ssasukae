'use client';

import Image from 'next/image';

import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

interface SocialLoginButtonProps {
  iconSrc: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function SocialLoginButton({
  iconSrc,
  label,
  onClick,
  disabled = false,
}: SocialLoginButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        jetBrainsMono.className,
        'group relative flex h-[58px] w-full items-center justify-between bg-[#292929] px-5 text-left text-sm tracking-[0.08em] text-zinc-100 transition-colors duration-200',
        'hover:bg-[#343434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]',
        disabled && 'cursor-not-allowed hover:bg-[#292929]',
      )}
      aria-label={disabled ? `${label} (준비 중)` : label}
      aria-disabled={disabled}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-[3px] origin-left scale-x-0 bg-neon-pink transition-transform duration-200 group-hover:scale-x-100',
          disabled && 'hidden',
        )}
      />
      <span>{label}</span>
      <span className="relative h-6 w-6 shrink-0 overflow-hidden" aria-hidden="true">
        <Image src={iconSrc} alt="" fill sizes="24px" className="object-contain" />
      </span>
    </button>
  );
}
