'use client';

import { useAuth } from '@/entities/user';
import { cn } from '@/shared/lib/cn';
import { BrandLogo } from '@/shared/ui/brand/BrandLogo';

interface MainHomeProps {
  className?: string;
}

export function MainHome({ className }: MainHomeProps) {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.replace('/');
  };

  return (
    <div className={cn('min-h-dvh bg-[#0a0a12] text-white', className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(168,85,247,0.18),transparent_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_100%,rgba(34,211,238,0.12),transparent_45%)]"
      />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8 sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <BrandLogo className="h-10 w-auto sm:h-12" />

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user?.nickname}</p>
              <p className="text-xs text-zinc-500">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5"
            >
              로그아웃
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-center py-12">
          <div className="space-y-3">
            <p className="text-sm text-fuchsia-300">환영합니다</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {user?.nickname}님, 준비됐나요?
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-zinc-400">
              방을 만들거나 코드로 참여해서 바로 노래방을 시작해 보세요.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              className="group rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-6 text-left transition-colors hover:border-fuchsia-400/40 hover:bg-fuchsia-500/15"
            >
              <p className="text-lg font-semibold">방 만들기</p>
              <p className="mt-2 text-sm text-zinc-400">새 노래방을 만들고 친구를 초대해요.</p>
            </button>

            <button
              type="button"
              className="group rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-6 text-left transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/15"
            >
              <p className="text-lg font-semibold">방 참여하기</p>
              <p className="mt-2 text-sm text-zinc-400">초대 코드를 입력해 바로 입장해요.</p>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
