import Image from 'next/image';

import { BRAND_LOGO_SRC, BRAND_NAME } from '@/shared/config/brand';
import { cn } from '@/shared/lib/cn';

interface BrandLogoProps {
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <Image
      src={BRAND_LOGO_SRC}
      alt={BRAND_NAME}
      width={480}
      height={180}
      priority={priority}
      className={cn(
        'h-12 w-auto origin-left cursor-pointer object-contain',
        'transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:scale-[1.03]',
        'motion-reduce:transition-none motion-reduce:hover:scale-100',
        className,
      )}
    />
  );
}
