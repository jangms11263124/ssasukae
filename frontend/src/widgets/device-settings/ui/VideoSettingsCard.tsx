'use client';

import { useState } from 'react';

import { RESOLUTION_OPTIONS, type MediaDeviceOption } from '@/entities/media-device';
import { cn } from '@/shared/lib/cn';
import { NeonSelect } from '@/shared/ui/select/NeonSelect';
import { SettingsPanel } from '@/shared/ui/panel/SettingsPanel';

import { toSelectOptions } from '../lib/toSelectOptions';
import { useCameraPreview } from '../model/useCameraPreview';
import { CameraPreview, type CameraPreviewViewStatus } from './CameraPreview';
import { VideoCameraIcon } from './icons';

interface VideoSettingsCardProps {
  cameras: MediaDeviceOption[];
  cameraId: string;
  resolution: string;
  isMirrored: boolean;
  isCameraReady: boolean;
  onCameraChange: (cameraId: string) => void;
  onResolutionChange: (resolution: string) => void;
  onMirroredChange: (isMirrored: boolean) => void;
}

export function VideoSettingsCard({
  cameras,
  cameraId,
  resolution,
  isMirrored,
  isCameraReady,
  onCameraChange,
  onResolutionChange,
  onMirroredChange,
}: VideoSettingsCardProps) {
  // 프리뷰 On/Off는 이 화면에만 적용되는 일시 상태다.
  // 저장되는 설정(입장 시 카메라 끄기)과는 별개이므로 store에 넣지 않는다.
  const [isPreviewEnabled, setIsPreviewEnabled] = useState(true);

  const { videoRef, status, errorMessage } = useCameraPreview({
    cameraId,
    isEnabled: isCameraReady && isPreviewEnabled,
  });

  const previewStatus: CameraPreviewViewStatus =
    isCameraReady && !isPreviewEnabled ? 'off' : status;

  return (
    <SettingsPanel title="VIDEO SETTINGS" icon={<VideoCameraIcon />}>
      <CameraPreview
        videoRef={videoRef}
        status={previewStatus}
        errorMessage={errorMessage}
        isMirrored={isMirrored}
        onTogglePreview={() => setIsPreviewEnabled((isEnabled) => !isEnabled)}
      />

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <NeonSelect
          id="camera-source"
          label="CAMERA SOURCE"
          value={cameraId}
          options={toSelectOptions(cameras)}
          onChange={onCameraChange}
          emptyLabel="NO_CAMERA_DETECTED"
        />

        <NeonSelect
          id="camera-resolution"
          label="RESOLUTION"
          value={resolution}
          options={RESOLUTION_OPTIONS}
          onChange={onResolutionChange}
          isDisabled
          hint="화질 설정은 준비 중입니다."
        />
      </div>

      <div className="mt-7 flex items-center justify-between gap-6 border border-white/[0.07] bg-black/20 p-5">
        <div>
          <p className="text-[0.66rem] font-bold tracking-[0.14em] text-zinc-200">
            MIRROR MY VIDEO
          </p>
          <p className="mt-1.5 text-[0.5rem] tracking-[0.1em] text-zinc-600">
            FLIP THE PREVIEW IMAGE HORIZONTALLY
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isMirrored}
          aria-label="프리뷰 좌우 반전"
          onClick={() => onMirroredChange(!isMirrored)}
          className={cn(
            'relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
            isMirrored
              ? 'border-cyan-400/40 bg-black/60 shadow-[inset_0_0_12px_rgba(34,211,238,0.12)]'
              : 'border-white/10 bg-black/40',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-[left,background-color]',
              isMirrored ? 'left-6 bg-white' : 'left-1 bg-zinc-600',
            )}
          />
        </button>
      </div>
    </SettingsPanel>
  );
}
