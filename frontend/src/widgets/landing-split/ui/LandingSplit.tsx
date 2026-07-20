'use client';

import Image from 'next/image';

import { SocialLoginPanel } from '@/features/auth-social-login';
import { cn } from '@/shared/lib/cn';
import { usePointerPosition } from '@/shared/lib/usePointerPosition';

import { LandingHeroContent } from './LandingHeroContent';
import { LandingLogo } from './LandingLogo';

interface LandingSplitProps {
  className?: string;
}

export function LandingSplit({ className }: LandingSplitProps) {
  const { ref, position, isActive, handlePointerMove, handlePointerLeave } =
    usePointerPosition<HTMLDivElement>();

  const parallaxX = (position.x - 0.5) * 20;
  const parallaxY = (position.y - 0.5) * 14;
  const glowX = position.x * 100;
  const glowY = position.y * 100;

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'relative min-h-dvh overflow-hidden bg-[#0a0a12] lg:min-h-screen',
        className,
      )}
    >
      <div aria-hidden="true" className="absolute inset-0">
        <div
          className="absolute inset-0 transition-transform duration-700 ease-out will-change-transform motion-reduce:transition-none"
          style={{
            transform: isActive
              ? `translate3d(${parallaxX}px, ${parallaxY}px, 0) scale(1.05)`
              : 'translate3d(0, 0, 0) scale(1.03)',
          }}
        >
          <Image
            src="/images/hero-karaoke.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_40%] lg:object-[center_30%]"
          />
        </div>

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,18,0.94)_0%,rgba(10,10,18,0.72)_35%,rgba(10,10,18,0.78)_100%)] lg:bg-[linear-gradient(105deg,rgba(10,10,18,0.92)_0%,rgba(10,10,18,0.52)_44%,rgba(10,10,18,0.58)_56%,rgba(10,10,18,0.88)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_12%,rgba(168,85,247,0.18),transparent_55%)] lg:bg-[radial-gradient(ellipse_at_24%_18%,rgba(168,85,247,0.2),transparent_52%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_72%,rgba(34,211,238,0.08),transparent_48%)]" />
        <div
          className={cn(
            'absolute inset-0 opacity-0 transition-opacity duration-500 motion-reduce:opacity-0',
            isActive && 'opacity-100',
          )}
          style={{
            background: `radial-gradient(560px circle at ${glowX}% ${glowY}%, rgba(236,72,153,0.16), transparent 58%), radial-gradient(420px circle at ${100 - glowX}% ${100 - glowY}%, rgba(34,211,238,0.1), transparent 55%)`,
          }}
        />
      </div>

      <div className="relative z-10 flex min-h-dvh flex-col lg:min-h-screen lg:flex-row lg:items-stretch">
        <div className="relative flex flex-1 flex-col px-5 pt-8 sm:px-8 lg:min-h-screen lg:w-1/2 lg:justify-center lg:px-12 lg:py-10">
          <LandingLogo className="lg:absolute lg:left-16 lg:top-10 xl:left-20" />

          <LandingHeroContent
            className="mt-8 sm:mt-10 lg:mt-0 lg:max-w-xl lg:pl-16 xl:pl-24"
            contentOffset={
              isActive
                ? {
                    x: (position.x - 0.5) * -6,
                    y: (position.y - 0.5) * -4,
                  }
                : undefined
            }
          />
        </div>

        <div className="mt-auto flex w-full flex-col items-center justify-center px-5 pb-12 pt-8 sm:px-8 sm:pb-16 lg:mt-0 lg:min-h-screen lg:w-1/2 lg:px-16 lg:py-10">
          <SocialLoginPanel />
        </div>
      </div>
    </div>
  );
}
