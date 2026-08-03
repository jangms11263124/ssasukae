'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import {
  feedbackQueryKeys,
  getFeedbackList,
  type FeedbackGradeFilter,
  type FeedbackPeriod,
  type FeedbackSort,
} from '@/entities/feedback';
import { cn } from '@/shared/lib/cn';
import { useInfiniteScrollTrigger } from '@/shared/lib/useInfiniteScrollTrigger';

import { FeedbackFilterBar } from './FeedbackFilterBar';
import { FeedbackSummaryCards } from './FeedbackSummaryCards';
import { FeedbackTrackItem } from './FeedbackTrackItem';

// 백엔드 페이지 크기(10)와 무관하게, 첫 로딩 자리를 채울 스켈레톤 개수
const SKELETON_COUNT = 4;

function TrackSkeleton() {
  return (
    <div className="flex items-center gap-8 border border-white/[0.06] bg-[#121214] p-5 pl-6">
      <div className="size-[4.5rem] shrink-0 animate-pulse bg-white/[0.04]" />
      <div className="flex-1 space-y-2.5">
        <div className="h-2 w-16 animate-pulse bg-white/[0.05]" />
        <div className="h-4 w-1/3 animate-pulse bg-white/[0.06]" />
        <div className="h-2 w-1/4 animate-pulse bg-white/[0.04]" />
      </div>
      <div className="h-8 w-24 animate-pulse bg-white/[0.05]" />
    </div>
  );
}

export function AiFeedbackSection() {
  const [period, setPeriod] = useState<FeedbackPeriod>('30');
  const [grade, setGrade] = useState<FeedbackGradeFilter>('All');
  const [sort, setSort] = useState<FeedbackSort>('recently');

  const {
    data,
    isPending,
    isError,
    error,
    isPlaceholderData,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: feedbackQueryKeys.list(period, grade, sort),
    queryFn: ({ pageParam }) => getFeedbackList({ period, grade, sort, cursor: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  const sentinelRef = useInfiniteScrollTrigger(
    fetchNextPage,
    Boolean(hasNextPage) && !isFetchingNextPage,
  );

  const items = data?.pages.flatMap((page) => page.feedbacks) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <section aria-label="AI 피드백 목록">
      <FeedbackSummaryCards />

      <div className="mt-12 flex flex-wrap items-end justify-between gap-6">
        <FeedbackFilterBar
          period={period}
          grade={grade}
          sort={sort}
          onPeriodChange={setPeriod}
          onGradeChange={setGrade}
          onSortChange={setSort}
        />
        <p className="pb-2.5 font-mono text-[0.62rem] tracking-[0.24em] text-zinc-500">
          SHOWING <span className="text-white">{items.length}</span> OF{' '}
          <span className="text-white">{total}</span> RESULTS
        </p>
      </div>

      {isPending ? (
        <div className="mt-6 space-y-3" aria-hidden="true">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <TrackSkeleton key={index} />
          ))}
        </div>
      ) : null}
      {isError ? (
        <p className="py-24 text-center font-mono text-xs tracking-[0.2em] text-red-400/80">
          {error instanceof Error ? error.message : 'FAILED_TO_LOAD_FEEDBACK'}
        </p>
      ) : null}
      {!isPending && !isError && items.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-mono text-xs tracking-[0.2em] text-zinc-600">NO_PERFORMANCE_LOGS</p>
          <p className="mt-3 text-sm text-zinc-500">
            조건에 맞는 공연 기록이 없습니다. 필터를 바꾸거나 공연을 완료해 보세요.
          </p>
          <Link
            href="/lobby"
            className="mt-6 inline-flex items-center gap-2 border border-white/15 bg-black/40 px-5 py-2.5 font-mono text-[0.62rem] font-bold tracking-[0.2em] text-zinc-300 transition-colors hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            GO_TO_LOBBY
          </Link>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul
          className={cn(
            'mt-6 space-y-3 transition-opacity',
            // 필터 변경 직후 이전 목록을 보여주는 동안엔 낡은 데이터임을 시각적으로 알린다
            isPlaceholderData && 'opacity-50',
          )}
        >
          {items.map((item, index) => (
            <li key={item.feedbackId}>
              <FeedbackTrackItem item={item} index={index} />
            </li>
          ))}
        </ul>
      ) : null}

      {isFetchingNextPage ? (
        <p className="py-6 text-center font-mono text-xs tracking-[0.2em] text-zinc-600">
          LOADING_MORE...
        </p>
      ) : null}
      {/* IntersectionObserver는 높이 0짜리 요소를 교차로 판정하지 않으므로 최소 높이를 준다. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
    </section>
  );
}
