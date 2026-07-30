import { useMutation, useQueryClient } from '@tanstack/react-query';

import { changeNickname } from './myPageApi';
import { userQueryKeys } from './queryKeys';

/**
 * 닉네임 변경. 마이페이지 카드와 헤더 프로필이 같은 닉네임을 보여주므로
 * 성공 시 두 쿼리를 모두 무효화한다.
 */
export function useChangeNicknameMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: changeNickname,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: userQueryKeys.myPage() }),
        queryClient.invalidateQueries({ queryKey: userQueryKeys.me() }),
      ]);
    },
  });
}
