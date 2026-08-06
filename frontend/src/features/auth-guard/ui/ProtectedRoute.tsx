'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/entities/user';

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a0a12]">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-fuchsia-400" />
        <p className="text-sm text-zinc-400">인증 정보를 확인하는 중...</p>
      </div>
    </div>
  );
}

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/** (protected) 레이아웃 전용. 비로그인 시 /login 으로 보낸다. */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return <AuthLoadingScreen />;
  }

  return children;
}
