'use client';

import { useMemo } from 'react';

import { PERFORMER_RECONNECT_GRACE_SECONDS } from '@/entities/performance';
import { useRoomStore } from '@/entities/room';

import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useRemainingSeconds } from '../../model/useRemainingSeconds';
import { useStageStore } from '../../model/stageStore';
import { StageButton } from './StageButton';

interface SuspendedOverlayProps {
  isPerformer: boolean;
}

/**
 * 재접속 유예 카운트다운. 유예가 시작될 때 새로 마운트돼야 useRemainingSeconds가
 * 그 시점의 시계로 센다 (대기 중에도 살려 두면 첫 프레임에 낡은 값이 나온다).
 */
function ReconnectCountdown({
  deadlineAt,
  isPerformer,
}: {
  deadlineAt: string;
  isPerformer: boolean;
}) {
  const remainingSeconds = useRemainingSeconds(deadlineAt);

  return (
    <div className="flex flex-col items-center gap-1" role="timer">
      <span className="font-mono text-5xl tabular-nums text-amber-300">{remainingSeconds}</span>
      <p className="text-xs text-zinc-400">
        {remainingSeconds > 0
          ? isPerformer
            ? '초 안에 연결이 복구되지 않으면 공연이 종료됩니다.'
            : '초 안에 가창자가 돌아오지 않으면 공연이 종료됩니다.'
          : '공연 종료를 처리하는 중입니다.'}
      </p>
    </div>
  );
}

/**
 * 가창자 연결 끊김으로 공연이 일시 중지된 동안 무대 위를 덮는다.
 * 가창자가 복귀해 재개 준비를 마치면 서버가 PERFORMANCE_RESUMED를 브로드캐스트한다.
 */
export function SuspendedOverlay({ isPerformer }: SuspendedOverlayProps) {
  const socket = useRoomSocketContext();
  const suspendedAt = useStageStore((state) => state.suspendedAt);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  // 가창자가 돌아오면 서버가 유예를 취소하므로, 끊긴 동안에만 남은 시간을 센다.
  const isPerformerOffline = useRoomStore((state) =>
    state.participants.some(
      (participant) =>
        participant.id === performerParticipantId &&
        participant.connectionStatus === 'DISCONNECTED',
    ),
  );

  // 서버는 유예 마감 시각을 따로 내려주지 않는다. 끊긴 시각에 유예 시간을 더해 구한다.
  const deadlineAt = useMemo(() => {
    if (suspendedAt === null) {
      return null;
    }

    const suspendedMs = new Date(suspendedAt).getTime();

    return Number.isFinite(suspendedMs)
      ? new Date(suspendedMs + PERFORMER_RECONNECT_GRACE_SECONDS * 1000).toISOString()
      : null;
  }, [suspendedAt]);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <p className="font-mono text-sm tracking-[0.18em] text-amber-300">PERFORMANCE PAUSED</p>
        <p className="text-lg font-semibold text-zinc-100">
          {isPerformer
            ? '연결이 끊겨 공연이 일시 중지되었습니다.'
            : '가창자 연결이 끊겨 공연이 일시 중지되었습니다.'}
        </p>

        {isPerformerOffline && deadlineAt !== null ? (
          <ReconnectCountdown deadlineAt={deadlineAt} isPerformer={isPerformer} />
        ) : null}

        {isPerformer ? (
          <StageButton onClick={socket.sendResumeReady}>공연 재개하기</StageButton>
        ) : (
          <p className="text-sm text-zinc-400">
            {isPerformerOffline
              ? '가창자가 돌아오면 다시 시작됩니다.'
              : '가창자가 돌아왔어요. 곧 다시 시작합니다.'}
          </p>
        )}
      </div>
    </div>
  );
}
