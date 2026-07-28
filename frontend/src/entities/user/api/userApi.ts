import { apiClient } from '@/shared/api/client';

import type { NicknameCheckResponse } from '../types';

export function checkNicknameAvailability(nickname: string) {
  const params = new URLSearchParams({ nickname: nickname.trim() });

  return apiClient<NicknameCheckResponse>(`/api/users/nickname/check?${params.toString()}`);
}
