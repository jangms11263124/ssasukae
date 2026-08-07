import type { Metadata } from 'next';

import { AuthenticatedHeader } from '@/widgets/authenticated-header';
import { LiveFeedFooter } from '@/widgets/live-feed-footer';

export const metadata: Metadata = {
  title: '도움말',
  description: '서비스 이용 방법을 안내하는 도움말 페이지입니다.',
};

export default function HelpPage() {
  return (
    <div className="min-h-dvh bg-[#08090c] text-white">
      <div className="flex min-h-dvh flex-col">
        <AuthenticatedHeader />

        <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_40%_10%,rgba(255,255,255,0.035),transparent_30%),linear-gradient(110deg,#101010_0%,#08090c_58%,#090b10_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_3px,rgba(255,255,255,0.01)_4px)]"
          />

          <section className="relative w-full max-w-md border border-[#00ffff] bg-[#232326] px-8 pb-8 pt-7 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <p className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">
              {'// HELP_CENTER'}
            </p>

            <h1 className="mt-2 font-sans text-3xl font-black uppercase italic tracking-tight text-white">
              Coming Soon
            </h1>

            <div className="mt-3 flex items-center gap-2" aria-hidden="true">
              <span className="size-1.5 shrink-0 rounded-full bg-[#00ffff]" />
              <span className="shrink-0 font-mono text-[10px] tracking-[0.18em] text-[#00ffff]">
                UNDER_CONSTRUCTION
              </span>
              <span className="h-px min-w-0 flex-1 bg-gradient-to-r from-white/25 to-transparent" />
            </div>

            <p className="mt-5 text-sm leading-relaxed text-zinc-300">
              도움말 페이지를 준비하고 있어요.
              <br />
              조금만 기다려 주세요!
            </p>
          </section>
        </main>

        <LiveFeedFooter />
      </div>
    </div>
  );
}
