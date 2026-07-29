import type { Metadata } from 'next';

import { DeviceSettingsPanel } from '@/widgets/device-settings';

export const metadata: Metadata = {
  title: '기기 설정',
  description: '공연에 사용할 카메라와 마이크, 오디오 출력 기기를 설정합니다.',
};

export default function SettingsPage() {
  return <DeviceSettingsPanel />;
}
