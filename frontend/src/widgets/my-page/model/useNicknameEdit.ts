'use client';

import { useState } from 'react';

import { checkNicknameAvailability, useChangeNicknameMutation } from '@/entities/user';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { showToast } from '@/shared/model/toastStore';

/**
 * 닉네임 중복 확인 상태.
 * `unchanged`: 서버의 중복 확인은 자기 현재 닉네임도 "중복"으로 응답하므로,
 * 에러로 보이지 않게 클라이언트에서 따로 갈라낸다.
 */
export type NicknameCheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'unchanged' }
  | { kind: 'error'; message: string };

export const NICKNAME_EDIT_COPY = {
  label: 'STAR NICKNAME',
  placeholder: 'ENTER_IDENTITY',
  check: 'CHECK ID',
  checking: 'CHECKING...',
  available: '사용할 수 있는 닉네임이에요.',
  unchanged: '지금 쓰고 있는 닉네임이에요.',
  required: '닉네임을 입력해 주세요.',
  duplicated: '이미 사용 중인 닉네임이에요.',
  checkFailed: '닉네임을 확인하지 못했어요. 다시 시도해 주세요.',
  saveFailed: '닉네임을 바꾸지 못했어요. 다시 시도해 주세요.',
  saved: '닉네임을 바꿨어요.',
} as const;

interface UseNicknameEditParams {
  currentNickname: string;
  /** 저장에 성공해 편집 모드를 닫아야 할 때 */
  onSaved: () => void;
}

export function useNicknameEdit({ currentNickname, onSaved }: UseNicknameEditParams) {
  const [nickname, setNickname] = useState(currentNickname);
  const [checkState, setCheckState] = useState<NicknameCheckState>({ kind: 'unchanged' });
  const changeNicknameMutation = useChangeNicknameMutation();

  const trimmed = nickname.trim();

  const handleChange = (value: string) => {
    setNickname(value);
    // 입력이 바뀌면 직전 확인 결과는 더 이상 이 값에 대한 것이 아니다.
    setCheckState(value.trim() === currentNickname ? { kind: 'unchanged' } : { kind: 'idle' });
  };

  const handleCheck = async () => {
    if (!trimmed) {
      setCheckState({ kind: 'error', message: NICKNAME_EDIT_COPY.required });
      return;
    }

    if (trimmed === currentNickname) {
      setCheckState({ kind: 'unchanged' });
      return;
    }

    setCheckState({ kind: 'checking' });

    try {
      const { available } = await checkNicknameAvailability(trimmed);

      setCheckState(
        available
          ? { kind: 'available' }
          : { kind: 'error', message: NICKNAME_EDIT_COPY.duplicated },
      );
    } catch (error) {
      setCheckState({
        kind: 'error',
        message: getApiErrorMessage(error, NICKNAME_EDIT_COPY.checkFailed),
      });
    }
  };

  const isSaving = changeNicknameMutation.isPending;
  const canSave = checkState.kind === 'available' && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;

    try {
      await changeNicknameMutation.mutateAsync(trimmed);
      showToast(NICKNAME_EDIT_COPY.saved);
      onSaved();
    } catch (error) {
      // 확인과 저장 사이에 다른 사용자가 선점했을 수 있어 입력값은 남겨 둔다.
      setCheckState({
        kind: 'error',
        message: getApiErrorMessage(error, NICKNAME_EDIT_COPY.saveFailed),
      });
    }
  };

  /** 편집을 취소했을 때 서버 값 기준으로 되돌린다. */
  const reset = () => {
    setNickname(currentNickname);
    setCheckState({ kind: 'unchanged' });
  };

  return {
    nickname,
    checkState,
    isSaving,
    canSave,
    handleChange,
    handleCheck,
    handleSave,
    reset,
  };
}
