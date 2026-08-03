import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TickerFooter } from '@/shared/ui/ticker/TickerFooter';
import { AiFeedbackDetailSection } from '@/widgets/ai-feedback-detail';
import { AuthenticatedHeader } from '@/widgets/authenticated-header';

export const metadata: Metadata = {
  title: 'AI 피드백 상세',
  description: '공연 1건의 점수와 AI 분석 피드백을 확인합니다.',
};

interface AiFeedbackDetailPageProps {
  params: Promise<{ feedbackId: string }>;
}

// 정적인 셸(헤더·브레드크럼·푸터)은 서버에서 렌더링하고,
// 데이터를 구독하는 AiFeedbackDetailSection만 클라이언트 경계로 남긴다.
export default async function AiFeedbackDetailPage({ params }: AiFeedbackDetailPageProps) {
  const { feedbackId } = await params;
  const performanceId = Number(feedbackId);

  if (!Number.isInteger(performanceId) || performanceId <= 0) {
    notFound();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0b0b0d] text-zinc-100">
      <AuthenticatedHeader />

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-6 py-12 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-sm tracking-[0.4em] text-zinc-400">
              PERSONAL_ARCHIVE / PERFORMANCE_LOG / ANALYSIS_REPORT
            </p>
            <h1 className="mt-2 font-sans text-2xl font-black uppercase italic tracking-tight text-white">
              Analysis Report.
            </h1>
          </div>
          <Link
            href="/ai-feedback"
            className="flex items-center gap-1.5 border border-white/10 bg-black/25 px-3 py-2 font-mono text-[0.58rem] font-bold tracking-[0.14em] text-zinc-400 transition-colors hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            &lt; BACK_TO_ARCHIVE
          </Link>
        </div>

        <div className="mt-8">
          <AiFeedbackDetailSection performanceId={performanceId} />
        </div>
      </main>

      <TickerFooter
        label="[AI_ARCHIVE]"
        message="ANALYSIS_ENGINE_ONLINE :: PERFORMANCE_DATA_SYNCED :: ARCHIVE_INDEX_READY :: SYSTEM STATUS: NOMINAL"
      />
    </div>
  );
}
