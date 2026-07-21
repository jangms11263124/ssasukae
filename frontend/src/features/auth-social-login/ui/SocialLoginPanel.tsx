'use client';

import { startGoogleOAuth, startKakaoOAuth } from '@/entities/user';
import { LOGIN_COPY } from '@/shared/config/brand';
import { cn } from '@/shared/lib/cn';

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
    if (provider === 'kakao') {
      startKakaoOAuth();
      return;
    }
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
        <SocialLoginButton provider="kakao" onClick={() => handleSocialLogin('kakao')} />
      </div>
    </div>
  );
}
