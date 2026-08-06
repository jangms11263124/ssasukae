'use client';

import { cn } from '@/shared/lib/cn';

import { SOUND_PANEL_LABEL } from '../../../config/dspParams';
import { useStageStore } from '../../../model/stageStore';
import { useMicBlocked } from '../../../model/useMicBlocked';
import { CamIcon, GestureIcon, MicIcon, SoundIcon } from '../../media-controls/MediaIcons';
import { FloatingMediaToggle } from '../../media-controls/FloatingMediaToggle';
import { MediaToggleButton } from '../../media-controls/MediaToggleButton';

type MediaControlsPlacement = 'bottom-center' | 'top-right';

interface MediaControlsOverlayProps {
  /** 제스처 토글은 가창자에게만 의미가 있다 */
  showGestureToggle?: boolean;
  /** 공연 중 가사(하단 중앙)와 겹치지 않게 우측 상단에 둔다 */
  placement?: MediaControlsPlacement;
  /** 가창자용 DSP 패널 토글 — placement가 top-right일 때 같은 줄에 배치 */
  soundToggle?: {
    disabled?: boolean;
    on: boolean;
    onToggle: () => void;
  };
}

export function MediaControlsOverlay({
  showGestureToggle = false,
  placement = 'bottom-center',
  soundToggle,
}: MediaControlsOverlayProps) {
  const micOn = useStageStore((state) => state.micOn);
  const camOn = useStageStore((state) => state.camOn);
  const gestureOn = useStageStore((state) => state.gestureOn);
  const toggleMic = useStageStore((state) => state.toggleMic);
  const toggleCam = useStageStore((state) => state.toggleCam);
  const toggleGesture = useStageStore((state) => state.toggleGesture);
  const micBlocked = useMicBlocked();

  return (
    <div
      className={cn(
        'z-20 flex items-center gap-2',
        'rounded-full border border-white/10 bg-black/45 px-2.5 py-1.5 backdrop-blur-md',
        'opacity-80 transition-opacity hover:opacity-100',
        placement === 'top-right'
          ? 'absolute right-4 top-4'
          : 'absolute bottom-4 left-1/2 -translate-x-1/2',
      )}
    >
      <FloatingMediaToggle
        icon={<MicIcon className="size-5" />}
        label="마이크"
        // 막힌 동안은 실제 송출 상태를 보여준다 — 토글은 켜져 있어도 소리는 나가지 않는다
        on={micOn && !micBlocked}
        onToggle={toggleMic}
        disabled={micBlocked}
        disabledReason="공연 중에는 가창자만 마이크를 쓸 수 있어요"
      />
      <FloatingMediaToggle
        icon={<CamIcon className="size-5" />}
        label="카메라"
        on={camOn}
        onToggle={toggleCam}
      />
      {showGestureToggle ? (
        // 제스처는 칩 형태 유지 — 가창자 전용 보조 컨트롤
        <MediaToggleButton
          icon={<GestureIcon />}
          label="GESTURE"
          on={gestureOn}
          onToggle={toggleGesture}
          disabled={!camOn}
          className="rounded-full border-white/15 bg-black/40 px-2.5 py-1.5"
        />
      ) : null}
      {soundToggle ? (
        <MediaToggleButton
          icon={<SoundIcon />}
          label={SOUND_PANEL_LABEL}
          on={soundToggle.on}
          onToggle={soundToggle.onToggle}
          showState={false}
          disabled={soundToggle.disabled}
          className="rounded-full border-white/15 bg-black/40 px-2.5 py-1.5"
        />
      ) : null}
    </div>
  );
}
