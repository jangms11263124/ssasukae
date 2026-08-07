'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/shared/lib/cn';

const NAV_ITEMS = [
  { href: '/lobby', label: 'HOME' },
  { href: '/favorite', label: 'LIKE' },
  { href: '/ai-feedback', label: 'AI_FEEDBACK' },
  { href: '/settings', label: 'SETTINGS' },
] as const;

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 현재 경로에 따른 활성 링크 표시만 담당하는 작은 클라이언트 경계. */
export function AuthenticatedNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="메인 메뉴"
      className="hidden items-center gap-14 font-mono text-xs tracking-[0.2em] text-zinc-300 md:flex"
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
                : 'border-transparent hover:text-white',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
