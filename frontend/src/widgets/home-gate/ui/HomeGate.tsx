'use client';

import { Suspense } from 'react';

import { useAuth } from '@/entities/user';
import { LandingSplit } from '@/widgets/landing-split';
import { MainHome } from '@/widgets/main-home';

function HomeGateContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0a0a12]">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-fuchsia-400" />
          <p className="text-sm text-zinc-400">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <MainHome />;
  }

  return <LandingSplit />;
}

export function HomeGate() {
  return (
    <Suspense fallback={<p className="text-center text-sm text-zinc-400">불러오는 중...</p>}>
      <HomeGateContent />
    </Suspense>
  );
}
