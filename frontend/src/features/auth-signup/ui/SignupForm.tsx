'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth, type SignupTokenClaims } from '@/entities/user';
import { useSignupMutation } from '@/features/auth-signup/api/useSignupMutation';
import { cn } from '@/shared/lib/cn';

interface SignupFormProps {
  signupToken: string;
  socialNickname?: string;
  defaultProfileImageUrl?: string;
  className?: string;
}

export function SignupForm({
  signupToken,
  socialNickname,
  defaultProfileImageUrl,
  className,
}: SignupFormProps) {
  const router = useRouter();
  const { loginWithAccessToken } = useAuth();
  const signupMutation = useSignupMutation();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const trimmedNickname = nickname.trim();
      const response = await signupMutation.mutateAsync({
        signupToken,
        ...(trimmedNickname ? { nickname: trimmedNickname } : {}),
        ...(defaultProfileImageUrl ? { profileImageUrl: defaultProfileImageUrl } : {}),
      });

      await loginWithAccessToken(response.accessToken, response.user);
      router.replace('/');
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : '회원가입에 실패했습니다. 다시 시도해 주세요.';

      if (message.includes('이미 가입된 사용자')) {
        setError('이미 가입된 계정입니다. Google 로그인으로 입장해 주세요.');
        return;
      }

      setError(message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">프로필 설정</h1>
        <p className="text-pretty text-base leading-relaxed text-zinc-400">
          사용할 닉네임을 입력하고 가입을 완료해 주세요.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="nickname" className="block text-sm font-medium text-zinc-300">
          닉네임
        </label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder={socialNickname || '노래방에서 사용할 닉네임'}
          maxLength={20}
          className="h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-base text-white placeholder:text-zinc-500 focus:border-fuchsia-400/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30"
        />
        <p className="text-xs text-zinc-500">비워두면 소셜 계정 닉네임이 사용됩니다.</p>
      </div>

      {error ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
          {error.includes('이미 가입된 계정') ? (
            <a
              href="/"
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/15 text-sm font-medium text-white transition-colors hover:bg-white/5"
            >
              로그인으로 이동
            </a>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={signupMutation.isPending}
        className="flex h-14 w-full items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {signupMutation.isPending ? '가입 중...' : '가입 완료'}
      </button>
    </form>
  );
}

export function getSignupDefaults(claims: SignupTokenClaims | null) {
  return {
    socialNickname: claims?.nickname ?? '',
    profileImageUrl: claims?.profileImageUrl ?? undefined,
  };
}
