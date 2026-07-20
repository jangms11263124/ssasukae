import { useMutation, useQueryClient } from '@tanstack/react-query';

import { logout } from '@/entities/user/api/authApi';
import { userQueryKeys } from '@/entities/user/api/queryKeys';
import { useAuthStore } from '@/shared/model/authStore';

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      useAuthStore.getState().clearAccessToken();
      queryClient.removeQueries({ queryKey: userQueryKeys.all });
    },
  });
}
