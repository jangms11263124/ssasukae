import { useMutation } from '@tanstack/react-query';

import { refreshAccessToken } from '@/entities/user/api/authApi';

export function useRefreshTokenMutation() {
  return useMutation({
    mutationFn: refreshAccessToken,
  });
}
