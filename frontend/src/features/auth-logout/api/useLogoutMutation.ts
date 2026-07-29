import { useMutation, useQueryClient } from '@tanstack/react-query';

import { logout, userQueryKeys } from '@/entities/user';
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
