import { BRAND_SUBTITLE, LOGO_PLACEHOLDER } from '@/shared/config/brand';
import { cn } from '@/shared/lib/cn';

interface LandingLogoProps {
  className?: string;
}

export function LandingLogo({ className }: LandingLogoProps) {
  return (
    <header className={cn(className)}>
      <p className="text-xl font-extrabold tracking-tight text-white sm:text-2xl lg:text-3xl">
        {LOGO_PLACEHOLDER}
      </p>
      <p className="mt-1 text-xs text-zinc-400 sm:text-sm">{BRAND_SUBTITLE}</p>
    </header>
  );
}
