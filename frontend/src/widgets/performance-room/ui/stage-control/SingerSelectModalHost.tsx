'use client';

import { useState } from 'react';

import type { RoomParticipant } from '@/entities/participant';
import { selectPerformer, useRoomStore } from '@/entities/room';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { showToast } from '@/shared/model/toastStore';

import { useStageStore } from '../../model/stageStore';
import { SingerSelectModal } from './SingerSelectModal';

interface SingerSelectModalHostProps {
  currentParticipantId: number;
  hostParticipantId: number;
  maxParticipants: number;
  participants: RoomParticipant[];
}

/** SINGER_SELECT 단계에서 방장 화면 전체에 뜨는 가창자 선택 모달 */
export function SingerSelectModalHost({
  currentParticipantId,
  hostParticipantId,
  maxParticipants,
  participants,
}: SingerSelectModalHostProps) {
  const confirmSinger = useStageStore((state) => state.confirmSinger);
  const cancelSingerSelect = useStageStore((state) => state.cancelSingerSelect);
  const roomId = useRoomStore((state) => state.session?.roomId ?? null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (selectedId === null || roomId === null || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await selectPerformer(roomId, selectedId);
      confirmSinger(selectedId);
    } catch (error) {
      showToast(getApiErrorMessage(error, '가창자를 지정하지 못했어요.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelect = (participantId: number) => {
    setSelectedId((previous) => (previous === participantId ? null : participantId));
  };

  return (
    <SingerSelectModal
      participants={participants}
      currentParticipantId={currentParticipantId}
      hostParticipantId={hostParticipantId}
      maxParticipants={maxParticipants}
      selectedId={selectedId}
      isSubmitting={isSubmitting}
      onSelect={handleSelect}
      onClose={cancelSingerSelect}
      onConfirm={() => void handleConfirm()}
    />
  );
}
