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
        'flex h-[50px] w-full items-center justify-between bg-[#292929] px-5 text-left text-xs tracking-[0.08em] text-zinc-100 transition-colors duration-200',
        'hover:bg-[#343434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]',
        disabled && 'cursor-not-allowed hover:bg-[#292929]',
      )}
      aria-label={disabled ? `${label} (준비 중)` : label}
      aria-disabled={disabled}
    >
      <span>{label}</span>
      <span className="relative h-5 w-5 shrink-0 overflow-hidden" aria-hidden="true">
        <Image src={iconSrc} alt="" fill sizes="20px" className="object-contain" />
      </span>
    </button>
  );
}
