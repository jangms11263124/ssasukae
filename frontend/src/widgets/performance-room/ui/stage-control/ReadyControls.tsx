'use client';

import { useEffect, useRef } from 'react';

import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageStore } from '../../model/stageStore';
import { StageButton } from '../center-stage/StageButton';
import { ControlMessage } from './ControlMessage';

interface ReadyControlsProps {
  isPerformer: boolean;
  performerNickname: string;
  songTitle: string;
  /** 준비 이벤트 수신(performanceId 확정) 여부. 수신 전에는 시작을 요청할 수 없다 */
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
  const mrLoadRequested = useStageStore((state) => state.mrLoadRequested);
  const requestMrLoad = useStageStore((state) => state.requestMrLoad);
  const socket = useRoomSocketContext();

  const title = `‘${performerNickname}’ 님이 ‘${songTitle}’을 선곡하셨습니다.`;

  // 서버 공연이 준비된 상태면 취소를 보내고 다시 선곡 단계로 돌아간다.
  const handleChangeSong = () => {
    if (performanceId !== null) {
      socket.sendCancel();
    }
    changeSong();
  };

  // 노래 바꾸기로 선곡이 반복될 수 있어 MR은 선곡이 아니라 시작 요청 시점에 내려받는다.
  const handleStart = () => {
    if (!canRequestStart || mrLoadRequested) return;
    requestMrLoad();
  };

  // 다운로드가 끝나면 재생 시작을 서버에 알린다. 가창자와 참가자가 같은 PLAYBACK_STARTED
  // 이벤트로 함께 전이되어야 한다 — 로컬에서 먼저 전이하면 전송 실패 시 가창자만 넘어간다.
  // 소켓 객체는 지연 측정값 갱신으로 주기적으로 바뀌므로 ref로 중복 전송을 막는다.
  const startSentRef = useRef(false);
  useEffect(() => {
    if (!isPerformer || !mrLoadRequested || !isMrLoaded || startSentRef.current) {
      return;
    }
    startSentRef.current = true;
    socket.sendPlaybackStart();
  }, [isPerformer, mrLoadRequested, isMrLoaded, socket]);

  if (!isPerformer) {
    return <ControlMessage title={title} subtitle="곧 공연이 시작됩니다. 조금만 기다려 주세요" />;
  }

  // 준비 실패는 기다려도 풀리지 않는다. '준비 중...' 대신 재시도 버튼을 내보내
  // 언제까지 기다려야 하는지 헷갈리지 않게 한다.
  const hasPrepareError = prepareError !== null;
  const isDownloading = mrLoadRequested && !isMrLoaded && !hasPrepareError;

  return (
    <div className="space-y-3">
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
      <div className="grid grid-cols-2 gap-2">
        <StageButton size="sm" className="w-full min-w-0" onClick={handleChangeSong}>
          노래 바꾸기
        </StageButton>
        {hasPrepareError ? (
          <StageButton size="sm" className="w-full min-w-0" onClick={onRetryPrepare}>
            다시 시도
          </StageButton>
        ) : (
          <StageButton
            size="sm"
            className="w-full min-w-0"
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
