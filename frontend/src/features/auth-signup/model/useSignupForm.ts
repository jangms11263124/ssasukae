'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { checkNicknameAvailability, useAuth } from '@/entities/user';
import { ApiError } from '@/shared/api/client';
import { API_ERROR_CODE } from '@/shared/api/errorResponse';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';

import { useSignupMutation } from '../api/useSignupMutation';
import { SIGNUP_ERROR_COPY } from '../config/signup';

interface UseSignupFormParams {
  signupToken: string;
  initialNickname?: string;
  defaultProfileImageUrl?: string;
}

function getSignupErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === API_ERROR_CODE.ALREADY_REGISTERED) {
    return SIGNUP_ERROR_COPY.alreadySignedUp;
  }

  return getApiErrorMessage(error, SIGNUP_ERROR_COPY.default);
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
  const [isNicknameChecking, setIsNicknameChecking] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [hasAcceptedPrivacy, setHasAcceptedPrivacy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleNicknameChange = (value: string) => {
    setNickname(value);
    setNicknameError(null);
    setIsNicknameConfirmed(false);
  };

  const handleNicknameCheck = async () => {
    const trimmedNickname = nickname.trim();

    if (!trimmedNickname) {
      setNicknameError(SIGNUP_ERROR_COPY.nicknameRequired);
      setIsNicknameConfirmed(false);
      return;
    }

    setIsNicknameChecking(true);
    setNicknameError(null);
    setIsNicknameConfirmed(false);

    try {
      const result = await checkNicknameAvailability(trimmedNickname);

      if (result.available) {
        setIsNicknameConfirmed(true);
        return;
      }

      setNicknameError(SIGNUP_ERROR_COPY.nicknameDuplicate);
    } catch (error) {
      setNicknameError(getApiErrorMessage(error, SIGNUP_ERROR_COPY.nicknameCheckFailed));
    } finally {
      setIsNicknameChecking(false);
    }
  };

  const canSubmit =
    isNicknameConfirmed &&
    hasAcceptedTerms &&
    hasAcceptedPrivacy &&
    !signupMutation.isPending &&
    !isNicknameChecking;

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
      router.replace('/lobby');
    } catch (error) {
      setSubmitError(getSignupErrorMessage(error));
    }
  };

  return {
    nickname,
    nicknameError,
    isNicknameConfirmed,
    isNicknameChecking,
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
