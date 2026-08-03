'use client';

import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { StageButton } from './StageButton';

interface SuspendedOverlayProps {
  isPerformer: boolean;
}

/**
 * 가창자 연결 끊김으로 공연이 일시 중지된 동안 무대 위를 덮는다.
 * 가창자가 복귀해 재개 준비를 마치면 서버가 PERFORMANCE_RESUMED를 브로드캐스트한다.
 */
export function SuspendedOverlay({ isPerformer }: SuspendedOverlayProps) {
  const socket = useRoomSocketContext();

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/70 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <p className="font-mono text-sm tracking-[0.18em] text-amber-300">PERFORMANCE PAUSED</p>
        <p className="text-lg font-semibold text-zinc-100">
          {isPerformer
            ? '연결이 끊겨 공연이 일시 중지되었습니다.'
            : '가창자 연결이 끊겨 공연이 일시 중지되었습니다.'}
        </p>
        {isPerformer ? (
          <StageButton onClick={socket.sendResumeReady}>공연 재개하기</StageButton>
        ) : (
          <p className="text-sm text-zinc-400">가창자가 돌아오면 자동으로 재개됩니다.</p>
        )}
      </div>
    </div>
  );
}
