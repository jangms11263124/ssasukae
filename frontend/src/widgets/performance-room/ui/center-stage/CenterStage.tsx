'use client';

import { StageLyricsProvider } from '../../model/StageLyricsContext';
import { useStageStore, type StagePhase } from '../../model/stageStore';
import { ActiveEffectBanner } from '../cards/ActiveEffectBanner';
import { CardCountdownOverlay } from '../cards/CardCountdownOverlay';
import { CardDealOverlay } from '../cards/CardDealOverlay';
import { PerformingStage } from './PerformingStage';
import { ScoreStage } from './ScoreStage';
import { SelfCameraStage } from './SelfCameraStage';
import { SuspendedOverlay } from './SuspendedOverlay';

interface CenterStageProps {
  currentParticipantId: number;
}

// 진행 안내·버튼은 우측 무대 진행 패널(StageControlPanel)이 맡는다.
// 무대는 공연 전에는 내 캠, 공연 중에는 가창자 캠, 채점 중에는 점수만 비춘다.
// 오디오 엔진은 StageAudioProvider(화면 레벨)가 소유한다 — READY의 MR 선로딩이
// PERFORMING까지 이어져야 하고, 진행 패널도 로딩 상태를 읽어야 하기 때문이다.
// 가사 싱크도 같은 이유로 여기서 공급한다 — 무대 뷰(PerformingStage)는 PERFORMING에서야
// 마운트되지만 CenterStage는 모든 단계에 살아 있어, READY에 미리 조회해 둘 수 있다.
export function CenterStage({ currentParticipantId }: CenterStageProps) {
  const phase = useStageStore((state) => state.phase);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const isSuspended = useStageStore((state) => state.isSuspended);

  const isPerformer = performerParticipantId === currentParticipantId;

  const STAGE_VIEWS: Record<StagePhase, React.ReactNode> = {
    PERFORMING: <PerformingStage isPerformer={isPerformer} />,
    READY: <SelfCameraStage />,
    SCORE: <ScoreStage />,
    SINGER_SELECT: <SelfCameraStage />,
    SONG_SELECT: <SelfCameraStage />,
    WAITING: <SelfCameraStage />,
  };

  return (
    <StageLyricsProvider isPerformer={isPerformer}>
      <div className="relative grid aspect-video min-h-[430px] overflow-hidden border border-white/10 bg-[#2c2c2f]">
        {STAGE_VIEWS[phase]}
        {isSuspended ? <SuspendedOverlay isPerformer={isPerformer} /> : null}
        <CardDealOverlay />
        <CardCountdownOverlay />
        <ActiveEffectBanner />
      </div>
    </StageLyricsProvider>
  );
}
