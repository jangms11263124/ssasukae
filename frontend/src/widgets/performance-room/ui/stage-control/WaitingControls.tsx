'use client';

import { useStageStore } from '../../model/stageStore';
import { StageButton } from '../center-stage/StageButton';
import { ControlMessage } from './ControlMessage';

const MIN_PARTICIPANTS_TO_START = 2;

interface WaitingControlsProps {
  isHost: boolean;
  participantCount: number;
}

export function WaitingControls({ isHost, participantCount }: WaitingControlsProps) {
  const startSingerSelect = useStageStore((state) => state.startSingerSelect);
  const canStart = participantCount >= MIN_PARTICIPANTS_TO_START;

  if (!isHost) {
    return (
      <ControlMessage
        title="모든 참가자가 들어오길 기다리고 있습니다..."
        subtitle="조금만 기다려 주세요"
      />
    );
  }

  return (
    <div className="flex items-center gap-3">
      <ControlMessage
        title="노래를 시작하시겠습니까?"
        subtitle={canStart ? undefined : '2명 이상 모여야 시작할 수 있습니다'}
      />
      <StageButton
        size="sm"
        className="min-w-0 shrink-0"
        disabled={!canStart}
        onClick={startSingerSelect}
      >
        시작하기
      </StageButton>
    </div>
  );
}
