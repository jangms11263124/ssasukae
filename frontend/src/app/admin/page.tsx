import type { Metadata } from 'next';

import { anybody } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';
import { AddSongPanel, AdminTickerFooter } from '@/widgets/admin-stage';
import { AuthenticatedHeader } from '@/widgets/authenticated-header';

export const metadata: Metadata = {
  title: '관리자',
  description: '곡을 추가하고 무대 콘텐츠를 관리합니다.',
};

export default function AdminPage() {
  return (
    <div className="min-h-dvh bg-[#08090c] text-white">
      <div className="flex min-h-dvh flex-col">
        <AuthenticatedHeader />

        <main className="relative flex flex-1 flex-col overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_40%_10%,rgba(255,255,255,0.035),transparent_30%),linear-gradient(110deg,#101010_0%,#08090c_58%,#090b10_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_3px,rgba(255,255,255,0.01)_4px)]"
          />

          <div className="relative mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
            {/* StageHero와 같은 타이틀 스케일을 쓴다. */}
            <h1
              className={cn(
                anybody.className,
                'mt-2 text-[2.55rem] font-black italic leading-[0.92] tracking-[0.015em] sm:text-5xl lg:text-[4.25rem]',
              )}
            >
              MANAGE STAGE
            </h1>

            <div className="my-6 border-t border-white/[0.07]" aria-hidden="true" />

            <AddSongPanel />
          </div>
        </main>

        <AdminTickerFooter />
      </div>
    </div>
  );
}
