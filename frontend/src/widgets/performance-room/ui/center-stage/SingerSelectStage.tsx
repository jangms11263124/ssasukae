'use client';

import { useState } from 'react';

import type { RoomParticipant } from '@/entities/participant';

import { useStageStore } from '../../model/stageStore';
import { StageButton } from './StageButton';
import { StageMessage } from './StageMessage';

interface SingerSelectStageProps {
  isHost: boolean;
  participants: RoomParticipant[];
}

export function SingerSelectStage({ isHost, participants }: SingerSelectStageProps) {
  const confirmSinger = useStageStore((state) => state.confirmSinger);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (!isHost) {
    return (
      <StageMessage title="가창자를 방장이 선택 중입니다..." subtitle="조금만 기다려 주세요" />
    );
  }

  return (
    <StageMessage
      title="가창자를 선택하세요..."
      actions={
        <div>
          <div className="flex flex-wrap justify-center gap-4">
            {participants.map((participant) => (
              <StageButton
                key={participant.id}
                size="sm"
                selected={selectedId === participant.id}
                onClick={() => setSelectedId(participant.id)}
              >
                {participant.nickname}
              </StageButton>
            ))}
          </div>
          <StageButton
            className="mt-5 min-w-80"
            disabled={selectedId === null}
            onClick={() => selectedId !== null && confirmSinger(selectedId)}
          >
            시작하기
          </StageButton>
        </div>
      }
    />
  );
}
