'use client';

import Link from 'next/link';

import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

import { SIGNUP_COPY } from '../config/signup';
import { useSignupForm } from '../model/useSignupForm';
import { SignupNicknameField } from './SignupNicknameField';
import { SignupTermsAgreement } from './SignupTermsAgreement';

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
  const form = useSignupForm({
    signupToken,
    initialNickname: socialNickname,
    defaultProfileImageUrl,
  });

  return (
    <form
      onSubmit={form.handleSubmit}
      className={cn(jetBrainsMono.className, 'w-full max-w-[416px]', className)}
    >
      <header className="space-y-3">
        <h1 className="text-sm tracking-[0.08em] text-neon-cyan">{SIGNUP_COPY.title}</h1>
        <p className="text-sm text-zinc-200">{SIGNUP_COPY.description}</p>
        <p className="pt-2 text-xs text-zinc-400">{SIGNUP_COPY.notice}</p>
      </header>

      <div className="mt-8">
        <SignupNicknameField
          nickname={form.nickname}
          error={form.nicknameError}
          isConfirmed={form.isNicknameConfirmed}
          isChecking={form.isNicknameChecking}
          onNicknameChange={form.handleNicknameChange}
          onCheck={form.handleNicknameCheck}
        />
      </div>

      <div className="mt-6">
        <SignupTermsAgreement
          hasAcceptedTerms={form.hasAcceptedTerms}
          hasAcceptedPrivacy={form.hasAcceptedPrivacy}
          onTermsChange={form.setHasAcceptedTerms}
          onPrivacyChange={form.setHasAcceptedPrivacy}
        />
      </div>

      {form.submitError ? (
        <p role="alert" className="mt-5 border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {form.submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!form.canSubmit}
        className="mt-6 flex h-[62px] w-full items-center justify-center border border-zinc-600 bg-[linear-gradient(90deg,#202020,#171717)] text-sm tracking-[0.18em] text-zinc-100 transition-colors hover:border-neon-cyan disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:border-zinc-600"
      >
        {form.isSubmitting ? SIGNUP_COPY.submitting : SIGNUP_COPY.submit}
      </button>

      <Link
        href="/login"
        className="mx-auto mt-7 flex w-fit items-center justify-center text-xs tracking-[0.2em] text-neon-cyan hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan"
      >
        {SIGNUP_COPY.returnToLogin}
      </Link>
    </form>
  );
}
