import { apiClient } from '@/shared/api/client';

import type {
  FeedbackGradeFilter,
  FeedbackListPage,
  FeedbackPeriod,
  FeedbackSort,
  FeedbackSummary,
} from '../types';

/** 피드백 요약 통계 조회 (GET /api/users/me/feedback/summary) */
export function getFeedbackSummary(): Promise<FeedbackSummary> {
  return apiClient<FeedbackSummary>('/api/users/me/feedback/summary', { auth: true });
}

export interface GetFeedbackListParams {
  period: FeedbackPeriod;
  grade: FeedbackGradeFilter;
  sort: FeedbackSort;
  cursor?: number;
}

/**
 * AI 피드백 목록 조회 (GET /api/users/me/performances)
 * 커서 기반 페이지네이션이며 페이지 크기는 백엔드에 10으로 고정되어 있다.
 */
export function getFeedbackList(params: GetFeedbackListParams): Promise<FeedbackListPage> {
  const searchParams = new URLSearchParams({
    period: params.period,
    grade: params.grade,
    sort: params.sort,
  });

  if (params.cursor !== undefined) searchParams.set('cursor', String(params.cursor));

  return apiClient<FeedbackListPage>(`/api/users/me/performances?${searchParams.toString()}`, {
    auth: true,
  });
}
