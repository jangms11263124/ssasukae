import Link from 'next/link';

import { decodeJwtPayload, type SignupTokenClaims } from '@/entities/user';
import { getSignupDefaults, SignupForm } from '@/features/auth-signup';
import { LandingSplit } from '@/widgets/landing-split';

interface SignupPageProps {
  searchParams: Promise<{ signupToken?: string | string[] }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const signupToken = Array.isArray(params.signupToken)
    ? params.signupToken[0]
    : params.signupToken;

  if (!signupToken) {
    return (
      <LandingSplit>
        <div className="space-y-4 text-center">
          <h1 className="text-2xl font-bold text-white">회원가입</h1>
          <p className="text-sm text-zinc-400">
            유효하지 않은 가입 링크입니다. 다시 로그인해 주세요.
          </p>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            로그인으로 이동
          </Link>
        </div>
      </LandingSplit>
    );
  }

  const claims = decodeJwtPayload<SignupTokenClaims>(signupToken);
  const defaults = getSignupDefaults(claims);

  return (
    <LandingSplit>
      <SignupForm
        signupToken={signupToken}
        socialNickname={defaults.socialNickname}
        defaultProfileImageUrl={defaults.profileImageUrl}
      />
    </LandingSplit>
  );
}
