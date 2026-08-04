'use client';

import { useOpenViduSessionContext } from '../../model/OpenViduSessionContext';
import { useStageStore } from '../../model/stageStore';
import { MediaControlsOverlay } from './overlays/MediaControlsOverlay';
import { StageBackdrop } from './StageBackdrop';
import { StageCameraFeed } from './StageCameraFeed';

/**
 * 공연 전(대기~준비) 단계의 무대. 진행 안내·버튼은 우측 무대 진행 패널이 맡고,
 * 무대는 내 캠만 비춘다 — 공연이 시작되면 PerformingStage가 가창자 캠으로 교체한다.
 */
export function SelfCameraStage() {
  const camOn = useStageStore((state) => state.camOn);
  const { localStream } = useOpenViduSessionContext();

  const cameraSource = camOn ? localStream : null;
  const placeholder =
    cameraSource !== null ? null : camOn ? '카메라를 준비하고 있습니다' : '카메라가 꺼져 있습니다';

  return (
    <StageBackdrop placeholder={placeholder}>
      {cameraSource !== null ? <StageCameraFeed source={cameraSource} mirrored /> : null}
      <MediaControlsOverlay />
    </StageBackdrop>
  );
}
