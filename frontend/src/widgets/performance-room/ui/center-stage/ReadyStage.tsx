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

  // 가창자와 참가자가 같은 PLAYBACK_STARTED 이벤트로 함께 전이되어야 한다.
  // 로컬에서 먼저 전이하면 전송 실패 시 가창자만 공연 화면으로 넘어갈 수 있다.
  const handleStart = () => {
    if (!canStart) return;
    socket.sendPlaybackStart();
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
