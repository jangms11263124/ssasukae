'use client';

import { QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '@/entities/user';
import { getQueryClient } from '@/shared/api/queryClient';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
