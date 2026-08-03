import { useQuery } from '@tanstack/react-query';

import { feedbackQueryKeys, getFeedbackSummary } from '@/entities/feedback';
import { cn } from '@/shared/lib/cn';
import { getScoreGrade, GRADE_CLASS, NO_SCORE_LABEL } from '@/shared/lib/scoreGrade';

const EMPTY_VALUE = '--';

interface SummaryCellProps {
  label: string;
  children: React.ReactNode;
  /** 첫 칸에만 켜는 상태 인디케이터(디자인의 ■ 마커) */
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

export function FeedbackSummaryCards() {
  const { data: summary } = useQuery({
    queryKey: feedbackQueryKeys.summary(),
    queryFn: getFeedbackSummary,
  });

  // 기록이 없으면 서버가 avgScore 0을 줄 수 있어, 그대로 계산하면 F로 오인된다.
  const grade = summary && summary.totalSongs > 0 ? getScoreGrade(summary.avgScore) : undefined;

  return (
    <section
      aria-label="피드백 요약 통계"
      className="relative border border-white/[0.08] bg-[linear-gradient(135deg,#1a1a1c_0%,#131315_62%,#0f0f11_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      {/* SettingsPanel과 같은 스캔라인 텍스처 */}
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
              grade ? GRADE_CLASS[grade] : 'text-zinc-500',
            )}
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
}
