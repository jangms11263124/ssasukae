import Link from 'next/link';

import { cn } from '@/shared/lib/cn';
import { BrandLogo } from '@/shared/ui/brand/BrandLogo';

import { AuthenticatedNav } from './AuthenticatedNav';
import { ProfileMenu } from './ProfileMenu';

interface AuthenticatedHeaderProps {
  className?: string;
}

export function AuthenticatedHeader({ className }: AuthenticatedHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 border-b border-cyan-400/20 bg-[linear-gradient(180deg,#1b1b1e,#101012)]',
        className,
      )}
    >
      <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between px-6 sm:px-10">
        <Link href="/lobby" aria-label="메인 로비로 이동" className="shrink-0">
          <BrandLogo className="h-11 w-auto" />
        </Link>

        <AuthenticatedNav />

        <ProfileMenu />
      </div>
    </header>
  );
}
