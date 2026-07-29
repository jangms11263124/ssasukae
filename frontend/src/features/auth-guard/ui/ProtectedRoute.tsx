'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/entities/user';

const PUBLIC_ROUTES = ['/login', '/signup', '/oauth/callback', '/login-error'] as const;

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

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

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublic = isPublicRoute(pathname);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublic) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, isPublic, router]);

  if (!isPublic && (isLoading || !isAuthenticated)) {
    return <AuthLoadingScreen />;
  }

  return children;
}
