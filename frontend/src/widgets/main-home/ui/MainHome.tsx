import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';
import { AuthenticatedHeader } from '@/widgets/authenticated-header';
import { LandingTickerFooter } from '@/widgets/landing-split';

import { CreateRoomPanel } from './CreateRoomPanel';
import { JoinRoomPanel } from './JoinRoomPanel';
import { StageHero } from './StageHero';

interface MainHomeProps {
  className?: string;
}

export function MainHome({ className }: MainHomeProps) {
  return (
    <div className={cn('min-h-dvh bg-[#08090c] text-white', className)}>
      <div className="flex min-h-dvh flex-col">
        <AuthenticatedHeader />

        <main className="relative flex-1 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_40%_10%,rgba(255,255,255,0.035),transparent_30%),linear-gradient(110deg,#101010_0%,#08090c_58%,#090b10_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_3px,rgba(255,255,255,0.01)_4px)]"
          />

          <div className="relative mx-auto flex min-h-full w-full max-w-[1440px] flex-col px-4 sm:px-6 lg:px-8">
            <StageHero />

            <div className="grid flex-1 gap-3 py-3 lg:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
              <CreateRoomPanel />
              <JoinRoomPanel />
            </div>

            <p
              className={`${jetBrainsMono.className} overflow-hidden whitespace-nowrap border-t border-white/[0.05] py-3 text-[0.48rem] tracking-[0.14em] text-zinc-700`}
              aria-hidden="true"
            >
              SYSTEM_ACCESS × AUTHENTICATED × ENCRYPTION_ACTIVE × SYNC_MODE_ENABLED ×
              SESSION_READY × SYSTEM_ACCESS × AUTHENTICATED
            </p>
          </div>
        </main>

        <LandingTickerFooter />
      </div>
    </div>
  );
}
