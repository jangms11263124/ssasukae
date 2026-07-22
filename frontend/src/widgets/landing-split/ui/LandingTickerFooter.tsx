import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

import { LANDING_TICKER_COPY } from '../config/landingTicker';

interface LandingTickerFooterProps {
  className?: string;
}

const TICKER_GROUP_COUNT = 2;

export function LandingTickerFooter({ className }: LandingTickerFooterProps) {
  return (
    <footer
      className={cn(
        jetBrainsMono.className,
        'relative z-20 flex h-10 shrink-0 items-stretch border-t border-white/[0.06] bg-[#090909] text-xs tracking-[0.08em]',
        className,
      )}
      aria-label="라이브 피드"
    >
      <div className="flex shrink-0 items-center gap-2.5 px-5 text-neon-cyan sm:px-8">
        <span className="h-2.5 w-2.5 rounded-full bg-neon-cyan" aria-hidden="true" />
        <span>{LANDING_TICKER_COPY.label}</span>
      </div>

      <div className="min-w-0 flex-1 overflow-hidden border-x border-white/[0.06]">
        <div className="flex h-full w-max min-w-full animate-ticker items-center motion-reduce:animate-none">
          {Array.from({ length: TICKER_GROUP_COUNT }, (_, groupIndex) => (
            <div
              key={groupIndex}
              className="flex min-w-full shrink-0 items-center justify-around gap-16 px-8 text-zinc-400"
              aria-hidden={groupIndex > 0}
            >
              <span className="whitespace-nowrap">{LANDING_TICKER_COPY.message}</span>
              <span className="whitespace-nowrap">{LANDING_TICKER_COPY.message}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden shrink-0 items-center px-8 text-neon-cyan sm:flex">
        TERMINAL ID: {LANDING_TICKER_COPY.terminalId}
      </div>
    </footer>
  );
}
