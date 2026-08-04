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
import { useCardStore } from '../../model/cardStore';
import { useGestureDspControl } from '../../model/useGestureDspControl';
import { useOpenViduSessionContext } from '../../model/OpenViduSessionContext';
import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { useStageLyricsContext } from '../../model/StageLyricsContext';
import { useStageStore } from '../../model/stageStore';
import { SoundIcon } from '../media-controls/MediaIcons';
import { MediaToggleButton } from '../media-controls/MediaToggleButton';
import { LyricsBlackout } from './overlays/LyricsBlackout';
import { LyricsNotice } from './overlays/LyricsNotice';
import { LyricsOverlay } from './overlays/LyricsOverlay';
import { MediaControlsOverlay } from './overlays/MediaControlsOverlay';
import { VocalDspPanel } from './overlays/VocalDspPanel';
import { StageBackdrop } from './StageBackdrop';
import { StageCameraFeed } from './StageCameraFeed';

// camOn은 무대에 오른 사람의 카메라 상태다(본인이면 내 토글, 아니면 가창자의 원격 상태).
function resolvePlaceholder(
  isPerformer: boolean,
  camOn: boolean,
  hasStream: boolean,
): string | null {
  if (hasStream) return null;
  if (!camOn) return '카메라가 꺼져 있습니다';
  if (!isPerformer) return '가창자 화면을 불러오는 중입니다';

  return '카메라를 준비하고 있습니다';
}

interface PerformingStageProps {
  isPerformer: boolean;
}

export function PerformingStage({ isPerformer }: PerformingStageProps) {
  const applyPerformanceCancelled = useStageStore((state) => state.applyPerformanceCancelled);
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

  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const { localStream, remoteStreams } = useOpenViduSessionContext();

  // 수성전 가사 가리기: 가창자의 시선에서만 가려지고 다른 참가자에게는 그대로 보인다.
  const activeEffect = useCardStore((state) => state.activeEffect);
  const lyricsHidden = isPerformer && activeEffect?.effectType === 'LYRICS_HIDE';

  // MR 재생 위치에 맞춰 소절이 넘어간다. 타임스탬프는 LRCLIB에서 받는다.
  // 조회는 READY부터 화면 레벨(StageLyricsProvider)에서 돌고 있어 여기서는 결과만 읽는다.
  const lyrics = useStageLyricsContext();

  // 가창자 본인은 publisher 스트림을, 참가자는 가창자의 remote 스트림을 무대 배경으로 깐다.
  const performerMedia =
    performerParticipantId !== null ? remoteStreams.get(performerParticipantId) : undefined;
  const stageCamOn = isPerformer
    ? camOn
    : performerMedia === undefined || performerMedia.videoActive;
  const cameraSource = isPerformer
    ? camOn
      ? localStream
      : null
    : performerMedia !== undefined && performerMedia.videoActive
      ? performerMedia.streamManager
      : null;

  // 중도 취소는 정상 종료(playback/finish)가 아니라 취소(cancel)를 보낸다 — 채점 대상이 아니다.
  // 정상 종료는 MR이 끝까지 재생됐을 때 useStageAudioEngine이 자동으로 보낸다.
  // 서버 브로드캐스트를 기다리지 않고 로컬에도 바로 반영해 전이가 늦어 보이지 않게 한다.
  const handleCancel = () => {
    socket.sendCancel();
    applyPerformanceCancelled();
  };

  // 제스처 오작동을 사용자가 알아챌 수 있어야 해서 취소 사유를 알린다.
  const handleGestureCancel = () => {
    handleCancel();
    showToast('제스처로 공연을 취소했습니다.');
  };

  const canUseGesture = isPerformer && gestureOn && camOn;

  const gesture = useGestureDspControl({
    containerRef: stageRef,
    videoRef,
    cursorRef,
    enabled: canUseGesture && isMediaPipeReady && cameraSource !== null,
    isPanelOpen: dspPanelOpen,
    onOpenPanel: () => setDspPanelOpen(true),
    onClosePanel: () => setDspPanelOpen(false),
    onCancelPerformance: handleGestureCancel,
  });

  return (
    <StageBackdrop
      ref={stageRef}
      placeholder={resolvePlaceholder(isPerformer, stageCamOn, cameraSource !== null)}
    >
      {/* CDN에서 수 MB를 받아오므로 제스처를 쓸 때만 로드한다 */}
      {canUseGesture ? <MediaPipeLoader onReady={() => setIsMediaPipeReady(true)} /> : null}

      {cameraSource !== null ? (
        <StageCameraFeed source={cameraSource} mirrored={isPerformer} videoRef={videoRef} />
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

      {lyricsHidden ? (
        <LyricsBlackout />
      ) : lyrics.status === 'READY' ? (
        <LyricsOverlay currentLine={lyrics.currentLine} nextLine={lyrics.nextLine} />
      ) : lyrics.message !== null ? (
        <LyricsNotice message={lyrics.message} />
      ) : null}

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
            onClick={handleCancel}
            className="absolute bottom-4 right-4 border border-white/30 bg-black/60 px-5 py-2 font-mono text-xs tracking-[0.18em] text-zinc-400 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
          >
            공연 취소
          </button>
        </>
      ) : null}
    </StageBackdrop>
  );
}
