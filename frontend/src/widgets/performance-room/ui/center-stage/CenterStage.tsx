'use client';

import type { RoomParticipant } from '@/entities/participant';

import { useStageAudioEngine } from '../../model/useStageAudioEngine';
import { useStageScoring } from '../../model/useStageScoring';
import { useStageStore, type StagePhase } from '../../model/stageStore';
import { ActiveEffectBanner } from '../cards/ActiveEffectBanner';
import { CardCountdownOverlay } from '../cards/CardCountdownOverlay';
import { CardDealOverlay } from '../cards/CardDealOverlay';
import { PerformingStage } from './PerformingStage';
import { ReadyStage } from './ReadyStage';
import { ScoreStage } from './ScoreStage';
import { SingerSelectStage } from './SingerSelectStage';
import { SongSelectStage } from './SongSelectStage';
import { SuspendedOverlay } from './SuspendedOverlay';
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
  const isSuspended = useStageStore((state) => state.isSuspended);
  const performanceId = useStageStore((state) => state.performanceId);

  const isPerformer = performerParticipantId === currentParticipantId;
  const performer = participants.find(({ id }) => id === performerParticipantId) ?? null;

  // READY에서 시작 요청 후 받은 MR이 PERFORMING까지 이어져야 해서 단계별 뷰가 아니라 여기 둔다.
  // 송출 스트림(getBroadcastStream)은 OpenVidu publisher 연동 시 여기서 꺼내 넘긴다.
  const audioEngine = useStageAudioEngine(isPerformer);

  // 채점 입력(STT·음정) 수집. 엔진이 연 마이크와 MR 시간축을 그대로 나눠 쓴다.
  useStageScoring(isPerformer, audioEngine.engine);

  const STAGE_VIEWS: Record<StagePhase, React.ReactNode> = {
    PERFORMING: <PerformingStage isPerformer={isPerformer} />,
    READY: (
      <ReadyStage
        isPerformer={isPerformer}
        performerNickname={performer?.nickname ?? ''}
        songTitle={selectedSong?.title ?? ''}
        // PERFORMANCE_PREPARATION_STARTED 수신(performanceId 확정) 전에는 시작을 요청할 수
        // 없다 — 이벤트 전에 시작하면 서버 전송 없이 화면만 전이된다.
        canRequestStart={performanceId !== null}
        isMrLoaded={audioEngine.isMrLoaded}
        prepareError={audioEngine.error}
      />
    ),
    SCORE: <ScoreStage />,
    SINGER_SELECT: <SingerSelectStage isHost={isHost} participants={participants} />,
    SONG_SELECT: <SongSelectStage isPerformer={isPerformer} />,
    WAITING: <WaitingStage isHost={isHost} participantCount={participants.length} />,
  };

  return (
    <div className="relative grid aspect-video min-h-[430px] overflow-hidden border border-white/10 bg-[#2c2c2f]">
      {STAGE_VIEWS[phase]}
      {isSuspended ? <SuspendedOverlay isPerformer={isPerformer} /> : null}
      <CardDealOverlay />
      <CardCountdownOverlay />
      <ActiveEffectBanner />
    </div>
  );
}
