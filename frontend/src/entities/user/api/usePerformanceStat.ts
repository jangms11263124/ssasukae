import { useQuery } from '@tanstack/react-query';

import { refreshPerformanceStat } from './myPageApi';
import { userQueryKeys } from './queryKeys';

/**
 * 공연 통계. 갱신(PATCH)이므로 자동 실행을 막고(`enabled: false`) 버튼의 refetch로만 부른다.
 * 결과는 세션 동안 캐시에 유지된다 — 갱신 요청인데 useMutation이 아닌 이유는,
 * 캐시를 읽는 queryFn 없는 useQuery를 따로 두면 React Query가 경고를 내기 때문.
 */
export function usePerformanceStat() {
  const { data, refetch, isFetching, isError } = useQuery({
    queryKey: userQueryKeys.performanceStat(),
    queryFn: refreshPerformanceStat,
    enabled: false,
    // 버튼으로만 갱신하므로 자동 무효화·수거를 끈다.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  return { stat: data, refresh: refetch, isFetching, isError };
}
