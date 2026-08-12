import { useEffect, useRef } from 'react';

import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageStore } from '../../model/stageStore';
import { StageButton } from '../center-stage/StageButton';
import { ControlMessage } from './ControlMessage';

interface ReadyControlsProps {
  isPerformer: boolean;
  performerNickname: string;
  songTitle: string;
  /** 선곡 완료 여부. prepare에 보낼 곡이 없으면 시작을 요청할 수 없다 */
  canRequestStart: boolean;
  /** 시작 요청 후 MR 다운로드 완료 여부 */
  isMrLoaded: boolean;
  /** MR 다운로드/엔진 초기화 실패 메시지 */
  prepareError: string | null;
  /** MR 다운로드 재시도 (실패했을 때만 노출된다) */
  onRetryPrepare: () => void;
}

export function ReadyControls({
  isPerformer,
  performerNickname,
  songTitle,
  canRequestStart,
  isMrLoaded,
  prepareError,
  onRetryPrepare,
}: ReadyControlsProps) {
  const changeSong = useStageStore((state) => state.changeSong);
  const performanceId = useStageStore((state) => state.performanceId);
  const selectedSong = useStageStore((state) => state.selectedSong);
  const mrLoadRequested = useStageStore((state) => state.mrLoadRequested);
  const requestMrLoad = useStageStore((state) => state.requestMrLoad);
  const socket = useRoomSocketContext();

  const title = `‘${performerNickname}’ 님이 ‘${songTitle}’을 선곡하셨습니다.`;

  // 시작 전에는 서버에 공연이 없어(선곡은 로컬 전이뿐) 취소 없이 선곡으로 돌아간다.
  // 시작하기로 prepare를 이미 보냈다면 서버 공연을 취소해야 한다.
  const handleChangeSong = () => {
    if (performanceId !== null) {
      socket.sendCancel();
    }
    changeSong();
  };

  // 시작하기에서 서버 공연 준비(prepare)를 요청한다 — 선곡 시점에 보내면 노래 바꾸기마다
  // 취소가 필요해진다. MR 다운로드도 준비 이벤트(URL 수신) 후 이 플래그로 시작된다.
  const handleStart = () => {
    if (!canRequestStart || mrLoadRequested) return;
    // 재접속 복원 등으로 서버 공연이 이미 있으면 prepare를 다시 보내지 않는다.
    if (performanceId === null && selectedSong !== null) {
      socket.sendPrepare(selectedSong.id);
    }
    requestMrLoad();
  };

  // 다운로드가 끝나면 재생 시작을 서버에 알린다. 가창자와 참가자가 같은 PLAYBACK_STARTED
  // 이벤트로 함께 전이되어야 한다 — 로컬에서 먼저 전이하면 전송 실패 시 가창자만 넘어간다.
  // performanceId 확정(PERFORMANCE_PREPARATION_STARTED 수신) 전에 보내면 조용히 버려진다.
  // 소켓 객체는 지연 측정값 갱신으로 주기적으로 바뀌므로 ref로 중복 전송을 막는다.
  const startSentRef = useRef(false);
  useEffect(() => {
    if (
      !isPerformer ||
      !mrLoadRequested ||
      !isMrLoaded ||
      performanceId === null ||
      startSentRef.current
    ) {
      return;
    }
    startSentRef.current = true;
    socket.sendPlaybackStart();
  }, [isPerformer, mrLoadRequested, isMrLoaded, performanceId, socket]);

  if (!isPerformer) {
    return <ControlMessage title={title} subtitle="곧 공연이 시작됩니다. 조금만 기다려 주세요" />;
  }

  // 준비 실패는 기다려도 풀리지 않는다. '준비 중...' 대신 재시도 버튼을 내보내
  // 언제까지 기다려야 하는지 헷갈리지 않게 한다.
  const hasPrepareError = prepareError !== null;
  const isDownloading = mrLoadRequested && !isMrLoaded && !hasPrepareError;

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <ControlMessage
        title={title}
        subtitle={
          hasPrepareError
            ? `${prepareError} 다시 시도하거나 다른 노래를 선택해 주세요.`
            : isDownloading
              ? 'MR 음원을 내려받는 중입니다...'
              : undefined
        }
      />
      <div className="flex shrink-0 gap-2">
        <StageButton size="sm" className="min-w-0" onClick={handleChangeSong}>
          노래 바꾸기
        </StageButton>
        {hasPrepareError ? (
          <StageButton size="sm" className="min-w-0" onClick={onRetryPrepare}>
            다시 시도
          </StageButton>
        ) : (
          <StageButton
            size="sm"
            className="min-w-0"
            onClick={handleStart}
            disabled={!canRequestStart || mrLoadRequested}
          >
            {mrLoadRequested ? '준비 중...' : '시작하기'}
          </StageButton>
        )}
      </div>
    </div>
  );
}
