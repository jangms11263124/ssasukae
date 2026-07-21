import { cn } from '@/shared/lib/cn';
import { BrandLogo } from '@/shared/ui/brand/BrandLogo';

interface LandingLogoProps {
  className?: string;
}

export function LandingLogo({ className }: LandingLogoProps) {
  return (
    <header className={cn(className)}>
      <BrandLogo priority className="h-14 w-auto sm:h-16 lg:h-[4.75rem]" />
    </header>
  );
}
