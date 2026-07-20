'use client';

import { LOGIN_COPY } from '@/shared/config/brand';
import { cn } from '@/shared/lib/cn';
import { startGoogleOAuth } from '@/entities/user';

import { SocialLoginButton } from './SocialLoginButton';

interface SocialLoginPanelProps {
  className?: string;
}

export function SocialLoginPanel({ className }: SocialLoginPanelProps) {
  const handleSocialLogin = (provider: 'google' | 'kakao') => {
    if (provider === 'google') {
      startGoogleOAuth();
      return;
    }

    window.alert('카카오 로그인은 준비 중입니다.');
  };

  return (
    <div className={cn('mx-auto w-full max-w-sm space-y-6 text-center', className)}>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
          {LOGIN_COPY.title}
        </h2>
        <p className="text-pretty text-base leading-relaxed text-zinc-400 lg:whitespace-nowrap">
          {LOGIN_COPY.description}
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:gap-3.5">
        <SocialLoginButton provider="google" onClick={() => handleSocialLogin('google')} />
        <SocialLoginButton
          provider="kakao"
          onClick={() => handleSocialLogin('kakao')}
          disabled
        />
      </div>
      <p className="text-xs text-zinc-500">카카오 로그인은 곧 지원될 예정입니다.</p>
    </div>
  );
}
