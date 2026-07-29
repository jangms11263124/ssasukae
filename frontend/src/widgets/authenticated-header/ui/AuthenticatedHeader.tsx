'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/shared/lib/cn';
import { BrandLogo } from '@/shared/ui/brand/BrandLogo';

import { ProfileMenu } from './ProfileMenu';

const NAV_ITEMS = [
  { href: '/loby', label: 'HOME' },
  { href: '/like', label: 'LIKE' },
  { href: '/ai-feedback', label: 'AI_FEEDBACK' },
  { href: '/settings', label: 'SETTINGS' },
] as const;

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface AuthenticatedHeaderProps {
  className?: string;
}

export function AuthenticatedHeader({ className }: AuthenticatedHeaderProps) {
  const pathname = usePathname();

  return (
    <header
      className={cn(
        'relative z-20 border-b border-cyan-400/20 bg-[linear-gradient(180deg,#1b1b1e,#101012)]',
        className,
      )}
    >
      <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between px-6 sm:px-10">
        <Link href="/loby" aria-label="메인 로비로 이동" className="shrink-0">
          <BrandLogo className="h-11 w-auto" />
        </Link>

        <nav
          aria-label="메인 메뉴"
          className="hidden items-center gap-14 font-mono text-[10px] tracking-[0.22em] text-zinc-400 md:flex"
        >
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'border-b pb-2 transition-colors',
                  active
                    ? 'border-cyan-300 text-cyan-200'
                    : 'border-transparent hover:text-zinc-200',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <ProfileMenu />
      </div>
    </header>
  );
}
