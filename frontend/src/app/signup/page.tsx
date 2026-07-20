'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { decodeJwtPayload, type SignupTokenClaims } from '@/entities/user';
import { getSignupDefaults, SignupForm } from '@/features/auth-signup';
import { AuthShell } from '@/widgets/auth-shell';

function SignupPageContent() {
  const searchParams = useSearchParams();
  const signupToken = searchParams.get('signupToken');

  if (!signupToken) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold text-white">회원가입</h1>
        <p className="text-sm text-zinc-400">유효하지 않은 가입 링크입니다. 다시 로그인해 주세요.</p>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-medium text-white transition-colors hover:bg-white/5"
        >
          로그인으로 이동
        </Link>
      </div>
    );
  }

  const claims = decodeJwtPayload<SignupTokenClaims>(signupToken);
  const defaults = getSignupDefaults(claims);

  return (
    <SignupForm
      signupToken={signupToken}
      socialNickname={defaults.socialNickname}
      defaultProfileImageUrl={defaults.profileImageUrl}
    />
  );
}

export default function SignupPage() {
  return (
    <AuthShell>
      <Suspense fallback={<p className="text-center text-sm text-zinc-400">불러오는 중...</p>}>
        <SignupPageContent />
      </Suspense>
    </AuthShell>
  );
}
