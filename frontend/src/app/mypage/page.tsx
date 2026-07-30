import type { Metadata } from 'next';

import { AuthenticatedHeader } from '@/widgets/authenticated-header';
import { ArchiveTickerFooter, MyPagePanel } from '@/widgets/my-page';

export const metadata: Metadata = {
  title: '마이페이지',
  description: '프로필과 찜한 곡, 공연 기록을 확인합니다.',
};

// 정적인 셸(헤더 배치·배경·푸터)은 서버에서 렌더링하고,
// 데이터를 구독하는 MyPagePanel만 클라이언트 경계로 남긴다.
export default function MyPage() {
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

          <MyPagePanel />
        </main>

        <ArchiveTickerFooter />
      </div>
    </div>
  );
}
