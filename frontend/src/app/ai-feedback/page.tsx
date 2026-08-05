import type { Metadata } from 'next';

import { AiFeedbackSection } from '@/widgets/ai-feedback-list';
import { AuthenticatedHeader } from '@/widgets/authenticated-header';
import { LiveFeedFooter } from '@/widgets/live-feed-footer';

export const metadata: Metadata = {
  title: 'AI 피드백',
  description: '공연 기록과 AI 분석 피드백을 확인합니다.',
};

// 셸은 서버 컴포넌트로 두고, 데이터를 구독하는 AiFeedbackSection만 클라이언트 경계로 남긴다.
export default function AiFeedbackPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-[#0b0b0d] text-zinc-100">
      <AuthenticatedHeader />

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-6 py-12 sm:px-10">
        <p className="font-mono text-sm tracking-[0.4em] text-zinc-400">
          PERSONAL_ARCHIVE / PERFORMANCE_LOG
        </p>
        <h1 className="mt-2 font-sans text-2xl font-black uppercase italic tracking-tight text-white">
          AI-Feedback.
        </h1>

        <div className="mt-8">
          <AiFeedbackSection />
        </div>
      </main>

      <LiveFeedFooter />
    </div>
  );
}
