import type { FeedbackGradeFilter, FeedbackPeriod, FeedbackSort } from '../types';

export const feedbackQueryKeys = {
  all: ['feedback'] as const,
  summary: () => [...feedbackQueryKeys.all, 'summary'] as const,
  list: (period: FeedbackPeriod, grade: FeedbackGradeFilter, sort: FeedbackSort) =>
    [...feedbackQueryKeys.all, 'list', period, grade, sort] as const,
};
