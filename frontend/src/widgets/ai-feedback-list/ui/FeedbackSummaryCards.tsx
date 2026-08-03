import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { feedbackQueryKeys, getFeedbackSummary } from '@/entities/feedback';
import { cn } from '@/shared/lib/cn';
import { getScoreGrade, NO_SCORE_LABEL, type ScoreGrade } from '@/shared/lib/scoreGrade';

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

// 필터 변경·무한 스크롤 등 부모 상태 변화에 리렌더될 이유가 없는 컴포넌트라 memo.
export const FeedbackSummaryCards = memo(function FeedbackSummaryCards() {
  const { data: summary } = useQuery({
    queryKey: feedbackQueryKeys.summary(),
    queryFn: getFeedbackSummary,
    staleTime: 60 * 1000,
  });

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
          <p className="font-sans text-5xl font-black leading-none tracking-tight text-white">
            {summary ? summary.totalSongs : EMPTY_VALUE}
          </p>
          <p className="pb-0.5 font-mono text-[0.55rem] font-bold tracking-[0.18em] text-zinc-600">
            ALL_TIME
          </p>
        </SummaryCell>

        <SummaryCell label="AVERAGE PERFORMANCE">
          <p className="font-sans text-5xl font-black leading-none tracking-tight text-white">
            {summary ? summary.avgScore.toFixed(1) : EMPTY_VALUE}
          </p>
          <p className="pb-0.5 font-mono text-[0.55rem] font-bold tracking-[0.18em] text-zinc-600">
            / 100 PTS
          </p>
        </SummaryCell>

        <SummaryCell label="CURRENT RANK">
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
          <p className="pb-0.5 font-mono text-[0.55rem] font-bold tracking-[0.18em] text-zinc-600">
            AVG_BASED
          </p>
        </SummaryCell>
      </div>
    </section>
  );
});
