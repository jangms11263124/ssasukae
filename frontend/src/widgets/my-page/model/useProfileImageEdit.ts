'use client';

import { useRef } from 'react';

import {
  PROFILE_IMAGE_ALLOWED_TYPES,
  PROFILE_IMAGE_MAX_SIZE_BYTES,
  PROFILE_IMAGE_MAX_SIZE_LABEL,
  PROFILE_IMAGE_TYPE_LABEL,
  useChangeProfileImageMutation,
} from '@/entities/user';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { showToast } from '@/shared/model/toastStore';

export const PROFILE_IMAGE_EDIT_COPY = {
  invalidType: `${PROFILE_IMAGE_TYPE_LABEL} 이미지만 올릴 수 있어요.`,
  tooLarge: `${PROFILE_IMAGE_MAX_SIZE_LABEL} 이하 이미지만 올릴 수 있어요.`,
  uploading: '[EDIT_MODE] 이미지를 올리는 중이에요...',
  hint: `[EDIT_MODE] ${PROFILE_IMAGE_TYPE_LABEL}, ${PROFILE_IMAGE_MAX_SIZE_LABEL} 이하 이미지만 올릴 수 있어요.`,
  saved: '프로필 이미지를 바꿨어요.',
  saveFailed: '프로필 이미지를 바꾸지 못했어요.',
} as const;

export function useProfileImageEdit() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const changeProfileImageMutation = useChangeProfileImageMutation();

  const isUploading = changeProfileImageMutation.isPending;

  const openFilePicker = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 골라도 change 이벤트가 발생하도록 선택값을 비운다.
    event.target.value = '';

    if (!file) return;

    if (!PROFILE_IMAGE_ALLOWED_TYPES.includes(file.type)) {
      showToast(PROFILE_IMAGE_EDIT_COPY.invalidType, 'error');
      return;
    }

    if (file.size > PROFILE_IMAGE_MAX_SIZE_BYTES) {
      showToast(PROFILE_IMAGE_EDIT_COPY.tooLarge, 'error');
      return;
    }

    try {
      await changeProfileImageMutation.mutateAsync(file);
      showToast(PROFILE_IMAGE_EDIT_COPY.saved);
    } catch (error) {
      showToast(getApiErrorMessage(error, PROFILE_IMAGE_EDIT_COPY.saveFailed), 'error');
    }
  };

  return {
    fileInputRef,
    isUploading,
    openFilePicker,
    handleFileChange,
  };
}
