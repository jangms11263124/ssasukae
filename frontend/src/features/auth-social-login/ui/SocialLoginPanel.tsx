'use client';

import { startGoogleOAuth, startKakaoOAuth } from '@/entities/user';
import { LOGIN_COPY } from '@/shared/config/brand';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

import {
  DEFAULT_ACTIVE_USER_COUNT,
  SOCIAL_PROVIDERS,
  type SocialProvider,
} from '../config/socialProviders';
import { SocialLoginButton } from './SocialLoginButton';

interface SocialLoginPanelProps {
  className?: string;
  activeUserCount?: number;
}

const SOCIAL_LOGIN_ACTIONS: Partial<Record<SocialProvider, () => void>> = {
  google: startGoogleOAuth,
  kakao: startKakaoOAuth,
};

export function SocialLoginPanel({
  className,
  activeUserCount = DEFAULT_ACTIVE_USER_COUNT,
}: SocialLoginPanelProps) {
  const getLoginAction = (provider: SocialProvider) => SOCIAL_LOGIN_ACTIONS[provider];

  return (
    <section
      className={cn(jetBrainsMono.className, 'mx-auto w-full max-w-[310px]', className)}
      aria-labelledby="login-title"
    >
      <header className="space-y-2 text-left">
        <h2 id="login-title" className="text-sm font-bold tracking-[0.08em] text-neon-pink">
          {LOGIN_COPY.title}
        </h2>
        <p className="text-xs tracking-wide text-zinc-200">{LOGIN_COPY.description}</p>
      </header>

      <div className="mt-11 flex flex-col gap-5">
        {SOCIAL_PROVIDERS.map((provider) => (
          <SocialLoginButton
            key={provider.id}
            label={provider.label}
            iconSrc={provider.iconSrc}
            onClick={getLoginAction(provider.id)}
          />
        ))}
      </div>

      <p className="mt-9 text-center text-sm tracking-wide text-neon-cyan">
        {LOGIN_COPY.activeUsers(activeUserCount)}
      </p>
    </section>
  );
}
