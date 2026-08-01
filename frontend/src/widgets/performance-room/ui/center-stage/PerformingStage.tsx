'use client';

import { useRef, useState } from 'react';

import {
  GestureCancelCountdown,
  GestureCursor,
  GestureStatusBadge,
  MediaPipeLoader,
} from '@/features/gesture-control';
import { showToast } from '@/shared/model/toastStore';

import { SOUND_PANEL_LABEL } from '../../config/dspParams';
import { useGestureDspControl } from '../../model/useGestureDspControl';
import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useLocalCameraStream } from '../../model/useLocalCameraStream';
import { useStageStore } from '../../model/stageStore';
import { SoundIcon } from '../media-controls/MediaIcons';
import { MediaToggleButton } from '../media-controls/MediaToggleButton';
import { LyricsOverlay } from './overlays/LyricsOverlay';
import { MediaControlsOverlay } from './overlays/MediaControlsOverlay';
import { VocalDspPanel } from './overlays/VocalDspPanel';
import { StageBackdrop } from './StageBackdrop';
import { StageCameraFeed } from './StageCameraFeed';

// 가사 싱크 엔진 연동 전까지 쓰는 목업.
const MOCK_LYRICS = {
  currentLine: 'LOOKING BACK AT THE STARS IN YOUR EYES',
  nextLine: "I'M STANDING ON THE EDGE OF TOMORROW",
} as const;

function resolvePlaceholder(
  isPerformer: boolean,
  camOn: boolean,
  hasStream: boolean,
): string | null {
  if (hasStream) return null;
  if (!isPerformer) return '가창자 화면을 불러오는 중입니다';
  if (!camOn) return '카메라가 꺼져 있습니다';

  return '카메라를 준비하고 있습니다';
}

interface PerformingStageProps {
  isPerformer: boolean;
}

export function PerformingStage({ isPerformer }: PerformingStageProps) {
  const applyPlaybackFinished = useStageStore((state) => state.applyPlaybackFinished);
  const camOn = useStageStore((state) => state.camOn);
  const gestureOn = useStageStore((state) => state.gestureOn);
  // 캠을 끄면 스토어가 패널까지 함께 닫으므로 여기서 따로 동기화하지 않는다.
  const dspPanelOpen = useStageStore((state) => state.dspPanelOpen);
  const setDspPanelOpen = useStageStore((state) => state.setDspPanelOpen);
  const toggleDspPanel = useStageStore((state) => state.toggleDspPanel);
  const socket = useRoomSocketContext();

  const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  // OpenVidu 연동 시 참가자 화면에도 가창자의 remote 스트림을 같은 자리에 렌더링한다.
  const cameraStream = useLocalCameraStream(isPerformer && camOn);

  // 서버 브로드캐스트를 기다리지 않고 로컬에도 바로 반영해 전이가 늦어 보이지 않게 한다.
  const handleFinish = () => {
    socket.sendPlaybackFinish();
    applyPlaybackFinished();
  };

  // 제스처 오작동을 사용자가 알아챌 수 있어야 해서 종료 사유를 알린다.
  const handleGestureFinish = () => {
    handleFinish();
    showToast('제스처로 공연을 종료했습니다.');
  };

  const canUseGesture = isPerformer && gestureOn && camOn;

  const gesture = useGestureDspControl({
    containerRef: stageRef,
    videoRef,
    cursorRef,
    enabled: canUseGesture && isMediaPipeReady && cameraStream !== null,
    isPanelOpen: dspPanelOpen,
    onOpenPanel: () => setDspPanelOpen(true),
    onClosePanel: () => setDspPanelOpen(false),
    onFinishPerformance: handleGestureFinish,
  });

  return (
    <StageBackdrop
      ref={stageRef}
      placeholder={resolvePlaceholder(isPerformer, camOn, cameraStream !== null)}
    >
      {/* CDN에서 수 MB를 받아오므로 제스처를 쓸 때만 로드한다 */}
      {canUseGesture ? <MediaPipeLoader onReady={() => setIsMediaPipeReady(true)} /> : null}

      {cameraStream !== null ? (
        <StageCameraFeed stream={cameraStream} videoRef={videoRef} />
      ) : null}

      <MediaControlsOverlay showGestureToggle={isPerformer} />

      {isPerformer ? (
        <>
          {/* 패널 바로 위에 고정해 열고 닫아도 자리가 움직이지 않게 한다 */}
          <MediaToggleButton
            icon={<SoundIcon />}
            label={SOUND_PANEL_LABEL}
            on={dspPanelOpen}
            onToggle={toggleDspPanel}
            showState={false}
            // 캠이 꺼지면 제스처로 조작할 수 없어 패널을 열 이유가 없다.
            disabled={!camOn}
            className="absolute right-4 top-4"
          />
          {dspPanelOpen ? (
            <VocalDspPanel
              onClose={() => setDspPanelOpen(false)}
              activeRowIndex={gesture.activeRowIndex}
              grabbedRowIndex={gesture.grabbedRowIndex}
            />
          ) : null}
        </>
      ) : null}

      <LyricsOverlay currentLine={MOCK_LYRICS.currentLine} nextLine={MOCK_LYRICS.nextLine} />

      {isPerformer ? (
        <>
          <GestureStatusBadge
            enabled={canUseGesture}
            isReady={isMediaPipeReady}
            isHandDetected={gesture.isHandDetected}
            error={gesture.error}
            className="absolute left-4 top-14"
          />
          <GestureCursor cursorRef={cursorRef} />
          {gesture.cancelProgress !== null ? (
            <GestureCancelCountdown progress={gesture.cancelProgress} />
          ) : null}

          <button
            type="button"
            onClick={handleFinish}
            className="absolute bottom-4 right-4 border border-white/30 bg-black/60 px-5 py-2 font-mono text-xs tracking-[0.18em] text-zinc-400 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
          >
            공연 종료
          </button>
        </>
      ) : null}
    </StageBackdrop>
  );
}
