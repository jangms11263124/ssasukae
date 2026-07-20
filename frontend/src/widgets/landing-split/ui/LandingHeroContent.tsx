'use client';

import { HERO_COPY } from '@/shared/config/brand';
import { cn } from '@/shared/lib/cn';

import { TypewriterHeadline } from './TypewriterHeadline';

interface ContentOffset {
  x: number;
  y: number;
}

interface LandingHeroContentProps {
  className?: string;
  contentOffset?: ContentOffset;
}

export function LandingHeroContent({ className, contentOffset }: LandingHeroContentProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center space-y-4 text-center lg:items-start lg:space-y-5 lg:text-left',
        className,
      )}
      style={{
        transform: contentOffset
          ? `translate3d(${contentOffset.x}px, ${contentOffset.y}px, 0)`
          : undefined,
      }}
    >
      <TypewriterHeadline
        lineBefore={HERO_COPY.headlineBefore}
        lineAccent={HERO_COPY.headlineAccent}
      />

      <p className="max-w-[22rem] text-pretty text-base leading-relaxed text-zinc-300/90 sm:text-lg lg:max-w-md lg:whitespace-nowrap">
        {HERO_COPY.description}
      </p>
    </div>
  );
}
