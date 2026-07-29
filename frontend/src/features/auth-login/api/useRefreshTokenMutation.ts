import { useMutation } from '@tanstack/react-query';

import { refreshAccessToken } from '@/entities/user';

export function useRefreshTokenMutation() {
  return useMutation({
    mutationFn: refreshAccessToken,
  });
}
