'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { feedbackQueryKeys, getFeedbackDetail } from '@/entities/feedback';
import { ApiError } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { getScoreGrade, GRADE_CLASS } from '@/shared/lib/scoreGrade';
import { SettingsPanel } from '@/shared/ui/panel/SettingsPanel';

import {
  AlertIcon,
  BulbIcon,
  ChartIcon,
  CheckCircleIcon,
  QuoteIcon,
  TargetIcon,
} from './icons';
import { InsightPanel } from './InsightPanel';
import { MetricRadarChart } from './MetricRadarChart';
import { ScoreCircle } from './ScoreCircle';
import { TrackHeader } from './TrackHeader';

function DetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex items-center gap-6">
        <div className="size-24 animate-pulse bg-white/[0.04]" />
        <div className="space-y-3">
          <div className="h-2.5 w-40 animate-pulse bg-white/[0.05]" />
          <div className="h-6 w-64 animate-pulse bg-white/[0.06]" />
          <div className="h-2.5 w-32 animate-pulse bg-white/[0.04]" />
        </div>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="h-[22rem] animate-pulse border border-white/[0.06] bg-white/[0.02]" />
        <div className="h-[22rem] animate-pulse border border-white/[0.06] bg-white/[0.02]" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-40 animate-pulse border border-white/[0.06] bg-white/[0.02]" />
        ))}
      </div>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="py-24 text-center">
      <p className="font-mono text-xs tracking-[0.2em] text-zinc-600">REPORT_NOT_FOUND</p>
      <p className="mt-3 text-sm text-zinc-500">
        피드백 기록을 찾을 수 없습니다. 삭제되었거나 접근 권한이 없는 기록입니다.
      </p>
      <Link
        href="/ai-feedback"
        className="mt-6 inline-flex items-center gap-2 border border-white/15 bg-black/40 px-5 py-2.5 font-mono text-[0.62rem] font-bold tracking-[0.2em] text-zinc-300 transition-colors hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        BACK_TO_ARCHIVE
      </Link>
    </div>
  );
}

interface AiFeedbackDetailSectionProps {
  performanceId: number;
}

export function AiFeedbackDetailSection({ performanceId }: AiFeedbackDetailSectionProps) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: feedbackQueryKeys.detail(performanceId),
    queryFn: () => getFeedbackDetail(performanceId),
    // 없는 기록(4xx)은 재시도해도 결과가 같다
    retry: (failureCount, err) =>
      !(err instanceof ApiError && err.status < 500) && failureCount < 2,
  });

  if (isPending) {
    return <DetailSkeleton />;
  }

  if (isError) {
    // 없는 id는 INVALID_REQUEST(4xx), 남의 기록은 RESOURCE_NOT_FOUND(4xx)로 온다
    if (error instanceof ApiError && error.status < 500) {
      return <NotFoundState />;
    }

    return (
      <p className="py-24 text-center font-mono text-xs tracking-[0.2em] text-red-400/80">
        {error instanceof Error ? error.message : 'FAILED_TO_LOAD_REPORT'}
      </p>
    );
  }

  const grade = data.scores.total !== null ? getScoreGrade(data.scores.total) : undefined;

  return (
    <div>
      <TrackHeader
        performanceId={data.performanceId}
        title={data.title}
        artist={data.artist}
        thumbnail={data.thumbnail ?? null}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <SettingsPanel title="SCORE RESULT" icon={<TargetIcon />}>
          <div className="flex flex-1 items-center justify-center py-6">
            <ScoreCircle score={data.scores.total} />
          </div>

          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-7 border border-white/[0.06] bg-black/30 p-5">
            <div>
              <p className="font-mono text-[0.52rem] font-bold tracking-[0.2em] text-zinc-600">
                RANK
              </p>
              <span
                className={cn(
                  'mt-2 flex size-20 items-center justify-center border bg-black/30 font-mono text-4xl font-bold',
                  grade ? GRADE_CLASS[grade] : 'border-white/[0.07] text-zinc-500',
                )}
              >
                {grade ?? '--'}
              </span>
            </div>

            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-mono text-[0.52rem] font-bold tracking-[0.2em] text-zinc-400">
                <QuoteIcon />
                OVERALL_SUMMARY
              </p>
              {data.overall ? (
                <p className="mt-2.5 text-[0.82rem] leading-relaxed text-zinc-300">
                  &ldquo;{data.overall}&rdquo;
                </p>
              ) : (
                <p className="mt-2.5 font-mono text-[0.62rem] tracking-[0.14em] text-zinc-600">
                  ANALYSIS_PENDING...
                </p>
              )}
            </div>
          </div>
        </SettingsPanel>

        <SettingsPanel title="AI METRIC BREAKDOWN" icon={<ChartIcon />}>
          <div className="mt-6">
            <MetricRadarChart scores={data.scores} />
          </div>
          <p className="mt-5 border-t border-white/[0.06] pt-4 font-mono text-[0.52rem] leading-relaxed tracking-[0.12em] text-zinc-600">
            [NOTICE] 분석 결과는 AI 추정치로, 실제 가창 평가와 다를 수 있습니다. 참고용으로
            활용해 주세요.
          </p>
        </SettingsPanel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <InsightPanel
            label="STRENGTHS"
            accent="cyan"
            icon={<CheckCircleIcon />}
            text={data.strength}
            className="flex-1"
          />
          <InsightPanel
            label="IMPROVEMENTS"
            accent="fuchsia"
            icon={<AlertIcon />}
            text={data.weakness}
            className="flex-1"
          />
        </div>
        <InsightPanel
          label="NEXT_STEP_TIP"
          accent="amber"
          icon={<BulbIcon />}
          text={data.tip}
          className="h-full"
        />
      </div>
    </div>
  );
}
