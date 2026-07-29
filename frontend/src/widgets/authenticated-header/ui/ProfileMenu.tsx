'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/entities/user';
import { useLogoutMutation } from '@/features/auth-logout';
import { showToast } from '@/shared/model/toastStore';

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 text-zinc-500"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="M9 4H5v16h4" />
      <path d="M13 12h8m0 0-3-3m3 3-3 3" />
    </svg>
  );
}

export function ProfileMenu() {
  const { user } = useAuth();
  const { mutateAsync: logout } = useLogoutMutation();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const containerRef = useRef<HTMLDivElement>(null);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    setIsOpen(false);

    try {
      await logout();
    } catch {
      showToast('로그아웃에 실패했습니다', 'error');
    }

    // 요청이 실패해도 onSettled에서 로컬 세션은 정리되므로 홈으로 이동시킨다
    router.replace('/');
  };

  const nickname = user?.nickname ?? '사용자';

  const menuItemClassName =
    'flex items-center justify-between px-5 py-2.5 font-mono text-sm tracking-[0.18em] text-zinc-200 transition-colors hover:bg-white/5 hover:text-cyan-200';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${nickname} 프로필 메뉴 열기`}
        className="grid size-9 place-items-center overflow-hidden rounded-full border border-zinc-300 text-sm font-semibold text-white transition-colors hover:border-cyan-300"
      >
        {user?.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external OAuth avatar host isn't configured in next/image
          <img src={user.profileImageUrl} alt="" className="size-full object-cover" />
        ) : (
          nickname.slice(0, 1)
        )}
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label={`${nickname} 프로필 메뉴`}
          className="absolute right-0 top-full z-30 mt-2 w-56 border border-[#00ffff] bg-[#232326] pb-4 pt-5 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
        >
          <p className="truncate px-5 font-sans text-2xl font-black uppercase italic tracking-tight text-white">
            {nickname}
          </p>

          <div className="mt-2.5 flex items-center gap-2 px-5" aria-hidden="true">
            <span className="size-1.5 shrink-0 rounded-full bg-[#00ffff]" />
            <span className="shrink-0 font-mono text-[10px] tracking-[0.18em] text-[#00ffff]">
              SESSION_ACTIVE
            </span>
            <span className="h-px min-w-0 flex-1 bg-gradient-to-r from-white/25 to-transparent" />
          </div>

          <div className="mt-3">
            <Link
              href="/mypage"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className={menuItemClassName}
            >
              MY PAGE
              <ChevronRightIcon />
            </Link>
            <Link
              href="/help"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className={menuItemClassName}
            >
              HELP
              <ChevronRightIcon />
            </Link>
          </div>

          <div className="mt-3 border-t border-white/10 px-5 pt-4">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2.5 border border-white/25 py-2.5 font-mono text-sm tracking-[0.18em] text-zinc-300 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
            >
              LOGOUT
              <LogoutIcon />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
