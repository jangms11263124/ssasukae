import Image from 'next/image';

import { HERO_COPY } from '@/shared/config/brand';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

import { LANDING_STAGE_COPY } from '../config/landingStage';

interface LandingStagePanelProps {
  className?: string;
}

export function LandingStagePanel({ className }: LandingStagePanelProps) {
  return (
    <section
      className={cn('relative min-h-[55dvh] overflow-hidden lg:min-h-0', className)}
      aria-label="서비스 소개"
    >
      <Image
        src="/images/backgrounds/screen.png"
        alt="네온빛 음반과 별 모양 오브제"
        fill
        priority
        sizes="(min-width: 1024px) 58vw, 100vw"
        className="object-cover object-center"
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,10,14,0.2)_0%,rgba(7,10,14,0.04)_45%,rgba(7,10,14,0.78)_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-20 [background-image:repeating-linear-gradient(0deg,transparent_0,transparent_3px,rgba(0,0,0,0.32)_4px)]"
      />

      <div
        className={cn(
          jetBrainsMono.className,
          'absolute left-6 top-8 space-y-2 text-xs tracking-[0.16em] text-zinc-400 sm:left-9 sm:top-10 sm:text-sm',
        )}
      >
        <p className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 bg-neon-cyan" aria-hidden="true" />
          {LANDING_STAGE_COPY.protocol}
        </p>
        <p>{LANDING_STAGE_COPY.latency}</p>
      </div>

      <div className="absolute bottom-8 left-6 right-6 sm:bottom-10 sm:left-9 sm:right-9">
        <div className="space-y-2 text-xs sm:text-sm">
          <p className="text-zinc-300">{HERO_COPY.description}</p>
          <p className="text-neon-cyan">
            {HERO_COPY.headlineBefore} {HERO_COPY.headlineAccent}
          </p>
        </div>

        <div
          className={cn(
            jetBrainsMono.className,
            'mt-5 flex items-center gap-3 text-xs tracking-[0.08em]',
          )}
          aria-label="서비스 슬로건"
        >
          <span className="border border-neon-cyan px-3 py-1.5 text-neon-cyan">
            {LANDING_STAGE_COPY.primaryAction}
          </span>
          <span className="border border-zinc-600 px-3 py-1.5 text-zinc-500">
            {LANDING_STAGE_COPY.secondaryAction}
          </span>
        </div>
      </div>
    </section>
  );
}
