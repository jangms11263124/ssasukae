'use client';

import type { ReactNode } from 'react';

import { useRoomStore } from '@/entities/room';

import { useStageAudioContext } from '../../model/StageAudioContext';
import { useStageStore, type StagePhase } from '../../model/stageStore';
import { RoomPanel } from '../RoomPanel';
import { ControlMessage } from './ControlMessage';
import { ReadyControls } from './ReadyControls';
import { SingerSelectControls } from './SingerSelectControls';
import { SongSelectControls } from './SongSelectControls';
import { WaitingControls } from './WaitingControls';

/**
 * 무대 진행(시작하기 → 가창자 선택 → 선곡 → 준비) 안내와 버튼을 담는 우측 패널.
 * 중앙 무대는 캠 화면 전용이라 진행 조작은 전부 여기서 한다.
 */
export function StageControlPanel() {
  const phase = useStageStore((state) => state.phase);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const selectedSong = useStageStore((state) => state.selectedSong);
  const performanceId = useStageStore((state) => state.performanceId);
  const isSuspended = useStageStore((state) => state.isSuspended);

  const session = useRoomStore((state) => state.session);
  const participants = useRoomStore((state) => state.participants);

  const audioEngine = useStageAudioContext();

  if (session === null) {
    return null;
  }

  const isHost = session.isHost;
  const isPerformer = session.myParticipantId === performerParticipantId;
  const performer = participants.find(({ id }) => id === performerParticipantId) ?? null;

  const CONTROL_VIEWS: Record<StagePhase, ReactNode> = {
    WAITING: <WaitingControls isHost={isHost} participantCount={participants.length} />,
    SINGER_SELECT: <SingerSelectControls isHost={isHost} participants={participants} />,
    SONG_SELECT: <SongSelectControls isPerformer={isPerformer} />,
    READY: (
      <ReadyControls
        isPerformer={isPerformer}
        performerNickname={performer?.nickname ?? ''}
        songTitle={selectedSong?.title ?? ''}
        // PERFORMANCE_PREPARATION_STARTED 수신(performanceId 확정) 전에는 시작을 요청할 수
        // 없다 — 이벤트 전에 시작하면 서버 전송 없이 화면만 전이된다.
        canRequestStart={performanceId !== null}
        isMrLoaded={audioEngine.isMrLoaded}
        prepareError={audioEngine.error}
        onRetryPrepare={audioEngine.retryLoadMr}
      />
    ),
    PERFORMING: (
      <ControlMessage
        title="공연이 진행 중입니다..."
        subtitle={isPerformer ? '공연 취소는 무대 우측 하단 버튼으로 할 수 있습니다' : undefined}
      />
    ),
    SCORE: <ControlMessage title="채점 결과를 기다리는 중입니다..." />,
  };

  // 일시 중지 중에는 진행 조작을 막는다. 무대 위 SuspendedOverlay가 재개를 안내하지만,
  // 패널은 무대 밖이라 여기서 직접 잠그지 않으면 중지 상태에서도 시작·선곡이 눌린다.
  const content = isSuspended ? (
    <ControlMessage
      title="공연이 일시 중지되었습니다..."
      subtitle={
        isPerformer
          ? '무대의 공연 재개하기 버튼으로 재개할 수 있습니다'
          : '가창자가 돌아오면 자동으로 재개됩니다'
      }
    />
  ) : (
    CONTROL_VIEWS[phase]
  );

  return (
    <RoomPanel className="px-4 py-4">
      <h2 className="border-b border-white/15 pb-2 text-sm font-bold tracking-[0.08em] text-cyan-300">
        STAGE CONTROL
      </h2>
      <div className="mt-4">{content}</div>
    </RoomPanel>
  );
}
