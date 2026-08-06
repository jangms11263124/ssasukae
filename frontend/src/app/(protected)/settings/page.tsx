import type { Metadata } from 'next';

import { AuthenticatedHeader } from '@/widgets/authenticated-header';
import { DeviceSettingsPanel } from '@/widgets/device-settings';
import { LiveFeedFooter } from '@/widgets/live-feed-footer';

export const metadata: Metadata = {
  title: '기기 설정',
  description: '공연에 사용할 카메라와 마이크, 오디오 출력 기기를 설정합니다.',
};

// 정적인 셸(헤더·배경·푸터)은 서버에서 렌더링하고,
// 미디어 장치를 다루는 DeviceSettingsPanel만 클라이언트 경계로 남긴다.
export default function SettingsPage() {
  return (
    <div className="min-h-dvh bg-[#08090c] text-white">
      <div className="flex min-h-dvh flex-col">
        <AuthenticatedHeader />

        <main className="relative flex-1 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_40%_10%,rgba(255,255,255,0.035),transparent_30%),linear-gradient(110deg,#101010_0%,#08090c_58%,#090b10_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_3px,rgba(255,255,255,0.01)_4px)]"
          />

          <DeviceSettingsPanel />
        </main>

        <LiveFeedFooter />
      </div>
    </div>
  );
}
