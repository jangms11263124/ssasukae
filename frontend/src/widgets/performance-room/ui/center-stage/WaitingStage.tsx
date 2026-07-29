'use client';

import { useStageStore } from '../../model/stageStore';
import { StageButton } from './StageButton';
import { StageMessage } from './StageMessage';

const MIN_PARTICIPANTS_TO_START = 2;

interface WaitingStageProps {
  isHost: boolean;
  participantCount: number;
}

export function WaitingStage({ isHost, participantCount }: WaitingStageProps) {
  const startSingerSelect = useStageStore((state) => state.startSingerSelect);
  const canStart = participantCount >= MIN_PARTICIPANTS_TO_START;

  if (!isHost) {
    return (
      <StageMessage
        title="모든 참가자가 들어오길 기다리고 있습니다..."
        subtitle="조금만 기다려 주세요"
      />
    );
  }

  return (
    <StageMessage
      title="노래를 시작하시겠습니까?"
      subtitle={canStart ? undefined : '2명 이상 모여야 시작할 수 있습니다'}
      actions={
        <StageButton size="lg" disabled={!canStart} onClick={startSingerSelect}>
          시작하기
        </StageButton>
      }
    />
  );
}
