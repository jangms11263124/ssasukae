import { cn } from '@/shared/lib/cn';
import { BrandLogo } from '@/shared/ui/brand/BrandLogo';

interface LandingHeaderProps {
  className?: string;
}

export function LandingHeader({ className }: LandingHeaderProps) {
  return (
    <header
      className={cn(
        'relative z-20 flex h-15 w-full items-center bg-[#111111] px-5 sm:px-8 lg:px-10',
        className,
      )}
    >
      <BrandLogo priority className="h-14 w-auto" />
    </header>
  );
}
