import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { MyPageResponse, User } from '../types';
import { changeProfileImage } from './myPageApi';
import { userQueryKeys } from './queryKeys';

/**
 * 서버가 항상 같은 S3 키(users/{id}/profile.*)에 덮어써 URL이 변하지 않는다.
 * 쿼리스트링으로 버전을 붙여야 브라우저가 캐시된 이전 이미지를 버린다.
 */
function withCacheBuster(url: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${Date.now()}`;
}

/**
 * 프로필 이미지 변경. 마이페이지 카드와 헤더 프로필 메뉴가 같은 이미지를 보여준다.
 * invalidate로 refetch하면 버전 없는 원래 URL로 돌아가 캐시된 옛 이미지가 다시 보이므로,
 * 응답 URL에 버전을 붙여 두 쿼리 캐시를 직접 갱신한다.
 */
export function useChangeProfileImageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: changeProfileImage,
    onSuccess: ({ url }) => {
      const profileImageUrl = withCacheBuster(url);

      queryClient.setQueryData<MyPageResponse>(userQueryKeys.myPage(), (prev) =>
        prev ? { ...prev, profileImageUrl } : prev,
      );
      queryClient.setQueryData<User>(userQueryKeys.me(), (prev) =>
        prev ? { ...prev, profileImageUrl } : prev,
      );
    },
  });
}
