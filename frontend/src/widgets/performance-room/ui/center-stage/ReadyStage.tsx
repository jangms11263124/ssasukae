'use client';

import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageStore } from '../../model/stageStore';
import { StageButton } from './StageButton';
import { StageMessage } from './StageMessage';

interface ReadyStageProps {
  isPerformer: boolean;
  performerNickname: string;
  songTitle: string;
  /** 준비 이벤트 수신 + MR 다운로드 완료 여부. 완료 전에는 시작할 수 없다 */
  canStart: boolean;
  /** MR 다운로드/엔진 초기화 실패 메시지 */
  prepareError: string | null;
}

export function ReadyStage({
  isPerformer,
  performerNickname,
  songTitle,
  canStart,
  prepareError,
}: ReadyStageProps) {
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
    if (!canStart) return;
    socket.sendPlaybackStart();
    startPerformance();
  };

  if (!isPerformer) {
    return <StageMessage title={title} subtitle="곧 공연이 시작됩니다. 조금만 기다려 주세요" />;
  }

  return (
    <StageMessage
      title={title}
      subtitle={prepareError ?? (canStart ? undefined : 'MR 음원을 준비하는 중입니다...')}
      actions={
        <div className="flex flex-wrap justify-center gap-4">
          <StageButton onClick={handleChangeSong}>노래 바꾸기</StageButton>
          <StageButton onClick={handleStart} disabled={!canStart}>
            {canStart ? '시작하기' : '준비 중...'}
          </StageButton>
        </div>
      }
    />
  );
}
