'use client';

import { useStageStore } from '../../../model/stageStore';
import { CamIcon, GestureIcon, MicIcon } from '../../media-controls/MediaIcons';
import { MediaToggleButton } from '../../media-controls/MediaToggleButton';

interface MediaControlsOverlayProps {
  /** 제스처 토글은 가창자에게만 의미가 있다 */
  showGestureToggle?: boolean;
}

export function MediaControlsOverlay({ showGestureToggle = false }: MediaControlsOverlayProps) {
  const micOn = useStageStore((state) => state.micOn);
  const camOn = useStageStore((state) => state.camOn);
  const gestureOn = useStageStore((state) => state.gestureOn);
  const toggleMic = useStageStore((state) => state.toggleMic);
  const toggleCam = useStageStore((state) => state.toggleCam);
  const toggleGesture = useStageStore((state) => state.toggleGesture);

  return (
    <div className="absolute left-4 top-4 flex flex-wrap gap-2">
      <MediaToggleButton icon={<MicIcon />} label="MIC" on={micOn} onToggle={toggleMic} />
      <MediaToggleButton icon={<CamIcon />} label="CAM" on={camOn} onToggle={toggleCam} />
      {showGestureToggle ? (
        // 캠이 꺼져 있으면 손 인식 입력 자체가 없어 켤 수 없다.
        <MediaToggleButton
          icon={<GestureIcon />}
          label="GESTURE"
          on={gestureOn}
          onToggle={toggleGesture}
          disabled={!camOn}
        />
      ) : null}
    </div>
  );
}
