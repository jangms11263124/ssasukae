'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/entities/user';

interface GuestOnlyGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function GuestOnlyGuard({ children, redirectTo = '/lobby' }: GuestOnlyGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0a0a12]">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-fuchsia-400" />
          <p className="text-sm text-zinc-400">불러오는 중...</p>
        </div>
      </div>
    );
  }

  return children;
}
