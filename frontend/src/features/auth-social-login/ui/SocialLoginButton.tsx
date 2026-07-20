'use client';

import { cn } from '@/shared/lib/cn';

type SocialProvider = 'google' | 'kakao';

interface SocialLoginButtonProps {
  provider: SocialProvider;
  onClick?: () => void;
  disabled?: boolean;
}

const providerConfig: Record<
  SocialProvider,
  { label: string; icon: React.ReactNode; className: string }
> = {
  google: {
    label: 'Google로 시작하기',
    className:
      'border-white/10 bg-white/5 text-white hover:border-white/25 hover:bg-white/10',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
    ),
  },
  kakao: {
    label: '카카오로 시작하기',
    className:
      'border-[#FEE500]/20 bg-[#FEE500] text-[#191919] hover:border-[#FEE500]/40 hover:bg-[#ffe94d]',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
        <path d="M12 3C6.48 3 2 6.58 2 10.97c0 2.84 1.87 5.34 4.68 6.78-.15.53-.97 3.42-.99 3.66 0 0-.02.17.09.24.11.07.24.02.24.02.32-.04 3.71-2.44 4.3-2.85.58.08 1.18.12 1.8.12 5.52 0 10-3.58 10-7.97C22 6.58 17.52 3 12 3z" />
      </svg>
    ),
  },
};

export function SocialLoginButton({ provider, onClick, disabled }: SocialLoginButtonProps) {
  const config = providerConfig[provider];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-14 w-full items-center justify-center gap-3 rounded-full border px-6 text-sm font-medium transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f18]',
        disabled && 'cursor-not-allowed opacity-50',
        config.className,
      )}
      aria-label={config.label}
      aria-disabled={disabled}
    >
      {config.icon}
      <span>{config.label}</span>
    </button>
  );
}
