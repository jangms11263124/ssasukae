'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/entities/user';
import { cn } from '@/shared/lib/cn';
import { BrandLogo } from '@/shared/ui/brand/BrandLogo';

import { ProfileMenu } from './ProfileMenu';

const NAVIGATION_ITEMS = [
  { label: 'HOME', href: '/' },
  { label: 'LIKE', href: '/like' },
  { label: 'AI_FEEDBACK', href: '/ai-feedback' },
  { label: 'SETTINGS', href: '/settings' },
] as const;

interface AuthenticatedHeaderProps {
  className?: string;
}

export function AuthenticatedHeader({ className }: AuthenticatedHeaderProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      await logout();
    } finally {
      window.location.replace('/');
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b border-white/10 bg-[linear-gradient(180deg,#202020_0%,#101010_62%,#090909_100%)] shadow-[0_4px_18px_rgba(0,0,0,0.45)]',
        className,
      )}
    >
      <div className="mx-auto grid h-16 w-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="홈으로 이동"
          className="justify-self-start rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
        >
          <BrandLogo priority className="h-9 w-auto sm:h-10" />
        </Link>

        <nav aria-label="주요 메뉴" className="h-full">
          <ul className="flex h-full items-stretch gap-1 sm:gap-5 lg:gap-10">
            {NAVIGATION_ITEMS.map((item) => {
              const isActive =
                item.href === '/'
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.href} className="h-full">
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative flex h-full items-center px-1 font-mono text-[0.58rem] font-bold tracking-[0.16em] transition-[color,opacity] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-cyan-300 sm:px-2 sm:text-[0.68rem]',
                      isActive
                        ? 'text-white opacity-100 drop-shadow-[0_0_3px_rgba(34,211,238,0.9)] after:absolute after:inset-x-1 after:bottom-2 after:h-px after:bg-cyan-300 after:shadow-[0_0_8px_rgba(34,211,238,0.9)] sm:after:inset-x-2'
                        : 'text-zinc-500 opacity-45 hover:text-zinc-100 hover:opacity-100',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div
          className="relative justify-self-end"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsProfileOpen(false);
            }
          }}
        >
          <button
            type="button"
            aria-label={user?.nickname ? `${user.nickname} 프로필 메뉴` : '내 프로필 메뉴'}
            aria-expanded={isProfileOpen}
            aria-controls="profile-menu"
            onClick={() => setIsProfileOpen((isOpen) => !isOpen)}
            className="flex size-8 items-center justify-center rounded-full border border-zinc-300 text-zinc-200 transition-colors hover:border-cyan-300 hover:text-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
              <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M6.75 18.25c.75-2.75 2.5-4.25 5.25-4.25s4.5 1.5 5.25 4.25"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {isProfileOpen && (
            <ProfileMenu
              nickname={user?.nickname}
              isLoggingOut={isLoggingOut}
              onLogout={handleLogout}
            />
          )}
        </div>
      </div>
    </header>
  );
}
