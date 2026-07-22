'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/entities/user';

import { useSignupMutation } from '../api/useSignupMutation';
import {
  ALREADY_SIGNED_UP_ERROR_FRAGMENT,
  SIGNUP_ERROR_COPY,
} from '../config/signup';

interface UseSignupFormParams {
  signupToken: string;
  initialNickname?: string;
  defaultProfileImageUrl?: string;
}

function getSignupErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return SIGNUP_ERROR_COPY.default;
  if (error.message.includes(ALREADY_SIGNED_UP_ERROR_FRAGMENT)) {
    return SIGNUP_ERROR_COPY.alreadySignedUp;
  }

  return error.message;
}

export function useSignupForm({
  signupToken,
  initialNickname,
  defaultProfileImageUrl,
}: UseSignupFormParams) {
  const router = useRouter();
  const { loginWithAccessToken } = useAuth();
  const signupMutation = useSignupMutation();
  const [nickname, setNickname] = useState(initialNickname ?? '');
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [isNicknameConfirmed, setIsNicknameConfirmed] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [hasAcceptedPrivacy, setHasAcceptedPrivacy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleNicknameChange = (value: string) => {
    setNickname(value);
    setNicknameError(null);
    setIsNicknameConfirmed(false);
  };

  const handleNicknameCheck = () => {
    if (!nickname.trim()) {
      setNicknameError(SIGNUP_ERROR_COPY.nicknameRequired);
      setIsNicknameConfirmed(false);
      return;
    }

    setNicknameError(null);
    setIsNicknameConfirmed(true);
  };

  const canSubmit =
    isNicknameConfirmed && hasAcceptedTerms && hasAcceptedPrivacy && !signupMutation.isPending;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitError(null);

    try {
      const response = await signupMutation.mutateAsync({
        signupToken,
        nickname: nickname.trim(),
        ...(defaultProfileImageUrl ? { profileImageUrl: defaultProfileImageUrl } : {}),
      });

      await loginWithAccessToken(response.accessToken, response.user);
      router.replace('/');
    } catch (error) {
      setSubmitError(getSignupErrorMessage(error));
    }
  };

  return {
    nickname,
    nicknameError,
    isNicknameConfirmed,
    hasAcceptedTerms,
    hasAcceptedPrivacy,
    submitError,
    isSubmitting: signupMutation.isPending,
    canSubmit,
    handleNicknameChange,
    handleNicknameCheck,
    setHasAcceptedTerms,
    setHasAcceptedPrivacy,
    handleSubmit,
  };
}
