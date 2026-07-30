import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/shared/model/authStore';

import { getMyPage } from './myPageApi';
import { userQueryKeys } from './queryKeys';

export function useMyPageQuery() {
  const accessToken = useAuthStore((state) => state.accessToken);

  return useQuery({
    queryKey: userQueryKeys.myPage(),
    queryFn: getMyPage,
    enabled: Boolean(accessToken),
  });
}
