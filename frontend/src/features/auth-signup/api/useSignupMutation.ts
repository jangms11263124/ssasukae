import { useMutation, useQueryClient } from '@tanstack/react-query';

import { signup } from '@/entities/user/api/authApi';
import { userQueryKeys } from '@/entities/user/api/queryKeys';
import { useAuthStore } from '@/shared/model/authStore';

export function useSignupMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signup,
    onSuccess: (response) => {
      useAuthStore.getState().setAccessToken(response.accessToken);
      queryClient.setQueryData(userQueryKeys.me(), response.user);
    },
  });
}
