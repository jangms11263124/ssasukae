import type { ReactNode } from 'react';

import { SocialLoginPanel } from '@/features/auth-social-login';
import { cn } from '@/shared/lib/cn';
import { LiveFeedFooter } from '@/widgets/live-feed-footer';

import { LandingHeader } from './LandingHeader';
import { LandingStagePanel } from './LandingStagePanel';

interface LandingSplitProps {
  className?: string;
  children?: ReactNode;
}

export function LandingSplit({ className, children }: LandingSplitProps) {
  return (
    <div
      className={cn(
        'flex min-h-dvh flex-col overflow-hidden bg-[#101010] lg:h-screen lg:min-h-screen',
        className,
      )}
    >
      <LandingHeader />

      <main className="relative z-10 grid flex-1 lg:min-h-0 lg:grid-cols-[58%_42%]">
        <LandingStagePanel />

        <section className="relative flex min-h-[28rem] items-center justify-center overflow-hidden bg-[#151515] px-5 py-12 sm:px-10 lg:min-h-0 lg:px-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_3px,rgba(255,255,255,0.018)_4px)]"
          />
          {children ?? <SocialLoginPanel className="relative z-10" />}
        </section>
      </main>

      <LiveFeedFooter />
    </div>
  );
}
