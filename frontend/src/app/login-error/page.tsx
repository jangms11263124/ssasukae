'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { AuthShell } from '@/widgets/auth-shell';

function LoginErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') ?? '로그인에 실패했습니다.';

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-white">로그인 실패</h1>
        <p className="text-sm leading-relaxed text-zinc-400">{error}</p>
      </div>
      <Link
        href="/"
        className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-medium text-white transition-colors hover:bg-white/5"
      >
        다시 로그인하기
      </Link>
    </div>
  );
}

export default function LoginErrorPage() {
  return (
    <AuthShell>
      <Suspense fallback={<p className="text-center text-sm text-zinc-400">불러오는 중...</p>}>
        <LoginErrorContent />
      </Suspense>
    </AuthShell>
  );
}
