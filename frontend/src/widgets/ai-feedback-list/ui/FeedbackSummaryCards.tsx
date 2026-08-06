import { memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  feedbackQueryKeys,
  getFeedbackSummary,
  type FeedbackSummary,
} from '@/entities/feedback';
import { usePerformanceStat } from '@/entities/user';
import { cn } from '@/shared/lib/cn';
import { getScoreGrade, NO_SCORE_LABEL, type ScoreGrade } from '@/shared/lib/scoreGrade';
import { RefreshIcon } from '@/shared/ui/icons/RefreshIcon';
import { Skeleton } from '@/shared/ui/skeleton/Skeleton';

const EMPTY_VALUE = '--';

/** 랭크 글자 광택용 [기본색, 하이라이트색]. GRADE_CLASS의 글자색과 톤을 맞춘다. */
const GRADE_SHINE: Record<ScoreGrade, [string, string]> = {
  S: ['#67e8f9', '#ecfeff'],
  A: ['#f0abfc', '#fdf4ff'],
  B: ['#fcd34d', '#fffbeb'],
  C: ['#d4d4d8', '#fafafa'],
  D: ['#9C6B30', '#e7c8a0'],
  F: ['#71717a', '#a1a1aa'],
};

interface SummaryCellProps {
  label: string;
  children: React.ReactNode;
  /** 첫 칸에만 켜는 ■ 마커 */
  showMarker?: boolean;
}

function SummaryCell({ label, children, showMarker = false }: SummaryCellProps) {
  return (
    <div className="px-8 py-7">
      <p className="flex items-center gap-2 font-mono text-[0.62rem] font-bold tracking-[0.3em] text-cyan-300">
        {showMarker && <span aria-hidden="true" className="size-1.5 bg-cyan-300" />}
        {label}
      </p>
      <div className="mt-3 flex items-end gap-3">{children}</div>
    </div>
  );
}

/** 숫자 자리(text-5xl)와 같은 높이의 스켈레톤. 값이 들어와도 칸 높이가 변하지 않는다. */
function FigureSkeleton({ className }: { className?: string }) {
  return <Skeleton tone="strong" className={cn('h-11', className)} />;
}

// 필터 변경·무한 스크롤 등 부모 상태 변화에 리렌더될 이유가 없는 컴포넌트라 memo.
export const FeedbackSummaryCards = memo(function FeedbackSummaryCards() {
  const queryClient = useQueryClient();
  const { data: summary, isPending } = useQuery({
    queryKey: feedbackQueryKeys.summary(),
    queryFn: getFeedbackSummary,
    staleTime: 60 * 1000,
  });

  // 요약 GET은 집계 테이블(UserPerformanceStat)을 읽기만 해서, 최신화하려면
  // 마이페이지와 같은 재계산 PATCH를 불러야 한다. 응답에 총 곡 수·평균이
  // 그대로 있으므로 재조회 없이 요약 캐시에 직접 반영한다.
  const { refresh, isFetching: isSyncing, isError: isSyncError } = usePerformanceStat();

  const handleRefresh = async () => {
    const { data: stat } = await refresh();
    if (!stat) return;
    queryClient.setQueryData<FeedbackSummary>(feedbackQueryKeys.summary(), {
      totalSongs: stat.totalSongs,
      avgScore: stat.avgScore,
    });
  };

  // 기록이 없으면 서버가 avgScore 0을 줄 수 있어, 그대로 계산하면 F로 오인된다.
  const grade = summary && summary.totalSongs > 0 ? getScoreGrade(summary.avgScore) : undefined;

  return (
    <section
      aria-label="피드백 요약 통계"
      className="relative border border-white/[0.08] bg-[linear-gradient(135deg,#1a1a1c_0%,#131315_62%,#0f0f11_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      {/* 스캔라인 텍스처 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_4px,rgba(255,255,255,0.012)_5px)]"
      />

      <div className="relative grid grid-cols-3 divide-x divide-white/[0.08]">
        <SummaryCell label="TOTAL SONGS" showMarker>
          {isPending ? (
            <FigureSkeleton className="w-20" />
          ) : (
            <p className="font-sans text-5xl font-black leading-none tracking-tight text-white">
              {summary ? summary.totalSongs : EMPTY_VALUE}
            </p>
          )}
          <p className="pb-0.5 font-mono text-[0.55rem] font-bold tracking-[0.18em] text-zinc-600">
            ALL_TIME
          </p>
        </SummaryCell>

        <SummaryCell label="AVERAGE PERFORMANCE">
          {isPending ? (
            <FigureSkeleton className="w-28" />
          ) : (
            <p className="font-sans text-5xl font-black leading-none tracking-tight text-white">
              {summary ? summary.avgScore.toFixed(1) : EMPTY_VALUE}
            </p>
          )}
          <p className="pb-0.5 font-mono text-[0.55rem] font-bold tracking-[0.18em] text-zinc-600">
            / 100 PTS
          </p>
        </SummaryCell>

        <SummaryCell label="CURRENT RANK">
          {isPending ? (
            <FigureSkeleton className="w-12" />
          ) : (
            <p
              className={cn(
                'font-sans text-5xl font-black leading-none tracking-tight',
                // 광택: 등급색 그라디언트를 글자에 클리핑하고 holo-shift로 하이라이트를 훑는다
                grade ? 'animate-holo-shift bg-clip-text text-transparent' : 'text-zinc-500',
              )}
              style={
                grade
                  ? {
                      backgroundImage: `linear-gradient(115deg, ${GRADE_SHINE[grade][0]} 38%, ${GRADE_SHINE[grade][1]} 50%, ${GRADE_SHINE[grade][0]} 62%)`,
                      backgroundSize: '250% 100%',
                    }
                  : undefined
              }
            >
              {grade ?? (summary ? NO_SCORE_LABEL : EMPTY_VALUE)}
            </p>
          )}
          <p className="pb-0.5 font-mono text-[0.55rem] font-bold tracking-[0.18em] text-zinc-600">
            AVG_BASED
          </p>
        </SummaryCell>
      </div>

      {/* grid(relative)보다 뒤에 둬야 겹치는 영역에서 클릭이 가로채이지 않는다 */}
      <button
        type="button"
        onClick={() => void handleRefresh()}
        disabled={isSyncing}
        className={cn(
          'absolute right-5 top-5 flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[0.5rem] font-bold tracking-[0.12em] transition-colors',
          'border-white/10 bg-black/25 text-zinc-400 hover:border-cyan-300/50 hover:text-cyan-200',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
          'disabled:cursor-wait disabled:text-zinc-600',
        )}
      >
        <span className={cn(isSyncing && 'animate-spin')}>
          <RefreshIcon />
        </span>
        {isSyncing ? 'SYNCING...' : 'REFRESH'}
      </button>

      {isSyncError && (
        <p
          role="alert"
          className="relative border-t border-white/[0.06] px-8 py-3 font-mono text-[0.5rem] tracking-[0.12em] text-fuchsia-400"
        >
          [ERROR] 통계를 갱신하지 못했습니다. 다시 시도해 주세요.
        </p>
      )}
    </section>
  );
});
