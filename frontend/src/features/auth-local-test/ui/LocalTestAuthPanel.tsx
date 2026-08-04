'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/entities/user';
import { ApiError } from '@/shared/api/client';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

import { loginLocalTestAccount, signupLocalTestAccount } from '../api/localTestAuthApi';

type AuthMode = 'login' | 'signup';

interface LocalTestAuthPanelProps {
  className?: string;
}

export function LocalTestAuthPanel({ className }: LocalTestAuthPanelProps) {
  const router = useRouter();
  const { loginWithAccessToken } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const normalizedLoginId = loginId.trim();
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(normalizedLoginId)) {
      setError('아이디는 영문, 숫자, _, - 조합으로 3~20자여야 합니다.');
      return;
    }
    if (password.length < 4 || password.length > 40) {
      setError('비밀번호는 4~40자로 입력해주세요.');
      return;
    }
    if (mode === 'signup' && (nickname.trim().length === 0 || nickname.trim().length > 20)) {
      setError('닉네임은 1~20자로 입력해주세요.');
      return;
    }

    setIsPending(true);
    setError(null);
    try {
      const response =
        mode === 'login'
          ? await loginLocalTestAccount({ loginId: normalizedLoginId, password })
          : await signupLocalTestAccount({
              loginId: normalizedLoginId,
              password,
              nickname: nickname.trim(),
            });
      await loginWithAccessToken(response.accessToken, response.user);
      router.replace('/lobby');
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (mode === 'login' && caught.status === 404) {
          setError('아이디 또는 비밀번호를 확인해주세요.');
        } else if (mode === 'signup' && caught.status === 409) {
          setError('이미 사용 중인 아이디 또는 닉네임입니다.');
        } else {
          setError(caught.message);
        }
      } else {
        setError('로그인 서버에 연결하지 못했습니다.');
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section
      className={cn(jetBrainsMono.className, 'relative z-10 mx-auto w-full max-w-[340px]', className)}
      aria-labelledby="local-test-auth-title"
    >
      <header className="space-y-2 text-left">
        <p className="text-[10px] font-bold tracking-[0.22em] text-neon-cyan">
          TEMPORARY · LOCAL TEST AUTH
        </p>
        <h2 id="local-test-auth-title" className="text-sm font-bold tracking-[0.08em] text-neon-pink">
          {mode === 'login' ? '간단 로그인' : '간단 회원가입'}
        </h2>
        <p className="text-xs leading-5 tracking-wide text-zinc-400">
          소셜 로그인 없이 저지연 방 연동을 시험하기 위한 임시 계정입니다.
        </p>
      </header>

      <div className="mt-7 grid grid-cols-2 border border-white/10">
        <ModeButton active={mode === 'login'} onClick={() => switchMode('login')}>
          로그인
        </ModeButton>
        <ModeButton active={mode === 'signup'} onClick={() => switchMode('signup')}>
          회원가입
        </ModeButton>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <AuthInput
          label="아이디"
          value={loginId}
          onChange={setLoginId}
          autoComplete="username"
          placeholder="test_user_01"
        />
        <AuthInput
          label="비밀번호"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="4자 이상"
        />
        {mode === 'signup' ? (
          <AuthInput
            label="닉네임"
            value={nickname}
            onChange={setNickname}
            autoComplete="nickname"
            placeholder="테스트 사용자"
          />
        ) : null}

        {error ? (
          <p role="alert" className="border border-red-400/25 bg-red-400/5 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="h-12 w-full border border-neon-cyan/50 bg-neon-cyan/10 text-sm font-bold text-neon-cyan transition-colors hover:bg-neon-cyan/15 disabled:cursor-wait disabled:opacity-50"
        >
          {isPending ? '처리 중...' : mode === 'login' ? '로그인' : '계정 만들기'}
        </button>
      </form>

      <p className="mt-5 text-center text-[10px] leading-4 text-zinc-600">
        local 프로필에서만 사용할 수 있으며 development 병합 전에 제거합니다.
      </p>
    </section>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-11 text-xs font-bold transition-colors',
        active ? 'bg-neon-pink/10 text-neon-pink' : 'text-zinc-500 hover:text-zinc-300',
      )}
    >
      {children}
    </button>
  );
}

function AuthInput({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password';
  autoComplete: string;
  placeholder: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] tracking-[0.14em] text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="h-11 w-full border border-white/15 bg-black/20 px-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-700 focus:border-neon-cyan/60"
      />
    </label>
  );
}
