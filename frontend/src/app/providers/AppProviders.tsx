'use client';

import { QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '@/entities/user';
import { getQueryClient } from '@/shared/api/queryClient';
import { ToastViewport } from '@/shared/ui/toast/ToastViewport';

/**
 * 전역 클라이언트 경계는 프로바이더·토스트만 유지한다.
 * 인증 가드는 (protected)/layout 으로 내려 공개 라우트 번들을 가볍게 둔다.
 * children 슬롯으로 RSC 트리는 그대로 통과한다.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <ToastViewport />
      </AuthProvider>
    </QueryClientProvider>
  );
}
