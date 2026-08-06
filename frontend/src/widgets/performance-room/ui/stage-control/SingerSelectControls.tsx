import { useState } from 'react';

import type { RoomParticipant } from '@/entities/participant';
import { selectPerformer, useRoomStore } from '@/entities/room';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { showToast } from '@/shared/model/toastStore';

import { useStageStore } from '../../model/stageStore';
import { StageButton } from '../center-stage/StageButton';
import { ControlMessage } from './ControlMessage';

interface SingerSelectControlsProps {
  isHost: boolean;
  participants: RoomParticipant[];
}

export function SingerSelectControls({ isHost, participants }: SingerSelectControlsProps) {
  const confirmSinger = useStageStore((state) => state.confirmSinger);
  const roomId = useRoomStore((state) => state.session?.roomId ?? null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 서버에 가창자 지정을 요청해 역할을 승격시킨다. 공연 준비(prepare)가
  // PERFORMER 역할을 요구하므로 로컬 전이만 하면 이후 선곡이 서버에서 거부된다.
  const handleConfirm = async () => {
    if (selectedId === null || roomId === null || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await selectPerformer(roomId, selectedId);
      // PERFORMER_SELECTED 이벤트로도 전이되지만, 지연에 대비해 즉시 반영한다.
      confirmSinger(selectedId);
    } catch (error) {
      showToast(getApiErrorMessage(error, '가창자를 지정하지 못했어요.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isHost) {
    return (
      <ControlMessage title="가창자를 방장이 선택 중입니다..." subtitle="조금만 기다려 주세요" />
    );
  }

  return (
    <div className="space-y-3">
      <ControlMessage title="가창자를 선택하세요..." />
      <div className="grid grid-cols-2 gap-2">
        {participants.map((participant) => (
          <StageButton
            key={participant.id}
            size="sm"
            className="w-full min-w-0 truncate px-2"
            selected={selectedId === participant.id}
            onClick={() => setSelectedId(participant.id)}
          >
            {participant.nickname}
          </StageButton>
        ))}
      </div>
      <StageButton
        size="sm"
        className="w-full min-w-0"
        disabled={selectedId === null || isSubmitting}
        onClick={handleConfirm}
      >
        시작하기
      </StageButton>
    </div>
  );
}
