import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/shared/model/authStore';

import { getCurrentUser } from './authApi';
import { userQueryKeys } from './queryKeys';

export function useUserQuery(enabled = true) {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useQuery({
    queryKey: userQueryKeys.me(),
    queryFn: getCurrentUser,
    enabled: enabled && Boolean(accessToken),
  });
}
