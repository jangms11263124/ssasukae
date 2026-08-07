import { apiClient } from '@/shared/api/client';

/**
 * 가창자 브라우저에서 채점 요청이 실패했음을 서버에 알린다 (가창자 본인만 허용).
 * 서버가 공연을 ANALYSIS_FAILED로 전이하고 PERFORMANCE_STATE_CHANGED를 브로드캐스트해
 * 다른 참가자들도 "채점 중..."에서 함께 빠져나온다.
 */
export function reportAnalysisFailure(performanceId: number): Promise<void> {
  return apiClient<void>(`/api/performances/${performanceId}/analysis-failure`, {
    method: 'POST',
    auth: true,
  });
}
