'use client';

import type { RoomParticipant } from '@/entities/participant';

import { useStageAudioEngine } from '../../model/useStageAudioEngine';
import { useStageStore, type StagePhase } from '../../model/stageStore';
import { PerformingStage } from './PerformingStage';
import { ReadyStage } from './ReadyStage';
import { ScoreStage } from './ScoreStage';
import { SingerSelectStage } from './SingerSelectStage';
import { SongSelectStage } from './SongSelectStage';
import { WaitingStage } from './WaitingStage';

interface CenterStageProps {
  currentParticipantId: number;
  isHost: boolean;
  participants: RoomParticipant[];
}

export function CenterStage({ currentParticipantId, isHost, participants }: CenterStageProps) {
  const phase = useStageStore((state) => state.phase);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const selectedSong = useStageStore((state) => state.selectedSong);

  const isPerformer = performerParticipantId === currentParticipantId;
  const performer = participants.find(({ id }) => id === performerParticipantId) ?? null;

  // READY의 MR 선로딩이 PERFORMING까지 이어져야 해서 단계별 뷰가 아니라 여기 둔다.
  // 송출 스트림(getBroadcastStream)은 OpenVidu publisher 연동 시 여기서 꺼내 넘긴다.
  useStageAudioEngine(isPerformer);

  const STAGE_VIEWS: Record<StagePhase, React.ReactNode> = {
    PERFORMING: <PerformingStage isPerformer={isPerformer} />,
    READY: (
      <ReadyStage
        isPerformer={isPerformer}
        performerNickname={performer?.nickname ?? ''}
        songTitle={selectedSong?.title ?? ''}
      />
    ),
    SCORE: <ScoreStage canEndStage={isHost || isPerformer} />,
    SINGER_SELECT: <SingerSelectStage isHost={isHost} participants={participants} />,
    SONG_SELECT: <SongSelectStage isPerformer={isPerformer} />,
    WAITING: <WaitingStage isHost={isHost} participantCount={participants.length} />,
  };

  return (
    <div className="grid aspect-video min-h-[430px] overflow-hidden border border-white/10 bg-[#2c2c2f]">
      {STAGE_VIEWS[phase]}
    </div>
  );
}
