import { ControlMessage } from './ControlMessage';

interface SingerSelectControlsProps {
  isHost: boolean;
}

export function SingerSelectControls({ isHost }: SingerSelectControlsProps) {
  if (!isHost) {
    return (
      <ControlMessage title="가창자를 방장이 선택 중입니다..." subtitle="조금만 기다려 주세요" />
    );
  }

  return (
    <ControlMessage
      title="가창자를 선택 중입니다..."
      subtitle="열린 창에서 참가자를 고른 뒤 시작해 주세요"
    />
  );
}
