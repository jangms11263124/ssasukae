'use client';

import { useState } from 'react';

import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useLocalCameraStream } from '../../model/useLocalCameraStream';
import { useStageStore } from '../../model/stageStore';
import { LyricsOverlay } from './overlays/LyricsOverlay';
import { MediaControlsOverlay } from './overlays/MediaControlsOverlay';
import { VocalDspPanel } from './overlays/VocalDspPanel';
import { StageBackdrop } from './StageBackdrop';
import { StageCameraFeed } from './StageCameraFeed';

// 가사 싱크 엔진이 붙기 전까지 사용하는 목업 가사.
const MOCK_LYRICS = {
  currentLine: 'LOOKING BACK AT THE STARS IN YOUR EYES',
  nextLine: "I'M STANDING ON THE EDGE OF TOMORROW",
} as const;

interface PerformingStageProps {
  isPerformer: boolean;
}

export function PerformingStage({ isPerformer }: PerformingStageProps) {
  const applyPlaybackFinished = useStageStore((state) => state.applyPlaybackFinished);
  const camOn = useStageStore((state) => state.camOn);
  const socket = useRoomSocketContext();
  const [isDspPanelOpen, setIsDspPanelOpen] = useState(true);

  // 가창자 본인 화면에는 로컬 캠을 무대 배경으로 깐다. OpenVidu 연동 시
  // 참가자 화면에도 가창자의 remote 스트림을 같은 자리에 렌더링한다.
  const cameraStream = useLocalCameraStream(isPerformer && camOn);

  // 서버에 재생 정상 종료를 알린다. PLAYBACK_FINISHED 이벤트가 오면
  // 모든 참가자가 같은 화면으로 전이되고, 로컬에서는 즉시 반영한다.
  const handleFinish = () => {
    socket.sendPlaybackFinish();
    applyPlaybackFinished();
  };

  return (
    <StageBackdrop>
      {cameraStream !== null ? <StageCameraFeed stream={cameraStream} /> : null}
      <MediaControlsOverlay />
      {isPerformer ? (
        isDspPanelOpen ? (
          <VocalDspPanel onClose={() => setIsDspPanelOpen(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setIsDspPanelOpen(true)}
            className="absolute right-4 top-4 border border-white/25 bg-black/60 px-3 py-1.5 font-mono text-xs tracking-[0.18em] text-zinc-400 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
          >
            VOCAL DSP
          </button>
        )
      ) : null}
      <LyricsOverlay currentLine={MOCK_LYRICS.currentLine} nextLine={MOCK_LYRICS.nextLine} />

      {isPerformer ? (
        <button
          type="button"
          onClick={handleFinish}
          className="absolute bottom-4 right-4 border border-white/30 bg-black/60 px-5 py-2 font-mono text-xs tracking-[0.18em] text-zinc-400 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
        >
          공연 종료
        </button>
      ) : null}
    </StageBackdrop>
  );
}
