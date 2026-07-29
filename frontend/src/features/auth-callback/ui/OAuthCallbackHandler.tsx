'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/entities/user';

export function OAuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loginWithAccessToken } = useAuth();
  const accessToken = searchParams.get('accessToken');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function completeLogin() {
      try {
        await loginWithAccessToken(token);
        if (!cancelled) {
          router.replace('/');
        }
      } catch {
        if (!cancelled) {
          setError('로그인 처리에 실패했습니다. 다시 시도해 주세요.');
        }
      }
    }

    void completeLogin();

    return () => {
      cancelled = true;
    };
  }, [accessToken, loginWithAccessToken, router]);

  if (!accessToken) {
    return (
      <div className="space-y-4 text-center">
        <p role="alert" className="text-sm text-red-200">
          로그인 정보가 없습니다. 다시 시도해 주세요.
        </p>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-medium text-white transition-colors hover:bg-white/5"
        >
          로그인으로 돌아가기
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 text-center">
        <p role="alert" className="text-sm text-red-200">
          {error}
        </p>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-medium text-white transition-colors hover:bg-white/5"
        >
          로그인으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-fuchsia-400" />
      <p className="text-sm text-zinc-400">로그인 처리 중...</p>
    </div>
  );
}
