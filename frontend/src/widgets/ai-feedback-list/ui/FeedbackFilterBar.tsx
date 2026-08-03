import { memo } from 'react';

import type {
  FeedbackGradeFilter,
  FeedbackPeriod,
  FeedbackSort,
} from '@/entities/feedback';
import { NeonSelect, type NeonSelectOption } from '@/shared/ui/select/NeonSelect';

const PERIOD_OPTIONS: readonly NeonSelectOption[] = [
  { value: '30', label: 'LAST_30_DAYS' },
  { value: '7', label: 'LAST_7_DAYS' },
  { value: '1', label: 'LAST_24_HOURS' },
];

const GRADE_OPTIONS: readonly NeonSelectOption[] = [
  { value: 'All', label: 'ALL_RANKS' },
  { value: 'S', label: 'RANK_S' },
  { value: 'A', label: 'RANK_A' },
  { value: 'B', label: 'RANK_B' },
  { value: 'C', label: 'RANK_C' },
  { value: 'D', label: 'RANK_D' },
  { value: 'F', label: 'RANK_F' },
];

const SORT_OPTIONS: readonly NeonSelectOption[] = [
  { value: 'recently', label: 'NEWEST' },
  { value: 'high-score', label: 'HIGHEST_SCORE' },
];

interface FeedbackFilterBarProps {
  period: FeedbackPeriod;
  grade: FeedbackGradeFilter;
  sort: FeedbackSort;
  onPeriodChange: (period: FeedbackPeriod) => void;
  onGradeChange: (grade: FeedbackGradeFilter) => void;
  onSortChange: (sort: FeedbackSort) => void;
}

// 필터 값이 그대로면 무한 스크롤 페칭 등 부모 리렌더에 따라올 이유가 없어 memo.
export const FeedbackFilterBar = memo(function FeedbackFilterBar({
  period,
  grade,
  sort,
  onPeriodChange,
  onGradeChange,
  onSortChange,
}: FeedbackFilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-5">
      <NeonSelect
        id="feedback-period-filter"
        label="PERIOD_FILTER"
        value={period}
        options={PERIOD_OPTIONS}
        onChange={(value) => onPeriodChange(value as FeedbackPeriod)}
        className="w-44"
      />
      <NeonSelect
        id="feedback-rank-type"
        label="RANK_TYPE"
        value={grade}
        options={GRADE_OPTIONS}
        onChange={(value) => onGradeChange(value as FeedbackGradeFilter)}
        className="w-40"
      />
      <NeonSelect
        id="feedback-sort-method"
        label="SORT_METHOD"
        value={sort}
        options={SORT_OPTIONS}
        onChange={(value) => onSortChange(value as FeedbackSort)}
        className="w-44"
      />
    </div>
  );
});
