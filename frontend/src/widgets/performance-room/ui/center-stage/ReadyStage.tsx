'use client';

import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageStore } from '../../model/stageStore';
import { StageButton } from './StageButton';
import { StageMessage } from './StageMessage';

interface ReadyStageProps {
  isPerformer: boolean;
  performerNickname: string;
  songTitle: string;
}

export function ReadyStage({ isPerformer, performerNickname, songTitle }: ReadyStageProps) {
  const changeSong = useStageStore((state) => state.changeSong);
  const startPerformance = useStageStore((state) => state.startPerformance);
  const performanceId = useStageStore((state) => state.performanceId);
  const socket = useRoomSocketContext();

  const title = `‘${performerNickname}’ 님이 ‘${songTitle}’을 선곡하셨습니다.`;

  // 서버 공연이 준비된 상태면 취소를 보내고 다시 선곡 단계로 돌아간다.
  const handleChangeSong = () => {
    if (performanceId !== null) {
      socket.sendCancel();
    }
    changeSong();
  };

  // PLAYBACK_STARTED 이벤트가 오면 서버 기준으로 다시 전이되지만,
  // 이벤트 지연에 대비해 로컬에서도 즉시 PERFORMING으로 넘어간다.
  const handleStart = () => {
    socket.sendPlaybackStart();
    startPerformance();
  };

  if (!isPerformer) {
    return <StageMessage title={title} subtitle="곧 공연이 시작됩니다. 조금만 기다려 주세요" />;
  }

  return (
    <StageMessage
      title={title}
      actions={
        <div className="flex flex-wrap justify-center gap-4">
          <StageButton onClick={handleChangeSong}>노래 바꾸기</StageButton>
          <StageButton onClick={handleStart}>시작하기</StageButton>
        </div>
      }
    />
  );
}
