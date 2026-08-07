'use client';

import type { MediaPermissionStatus } from '@/entities/media-device';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

interface DeviceSystemStatusBarProps {
  permission: MediaPermissionStatus;
  errorMessage: string | null;
  isCameraDetected: boolean;
  isMicrophoneDetected: boolean;
  isAudioOutputDetected: boolean;
  onRequestPermission: () => void;
}

export function DeviceSystemStatusBar({
  permission,
  errorMessage,
  isCameraDetected,
  isMicrophoneDetected,
  isAudioOutputDetected,
  onRequestPermission,
}: DeviceSystemStatusBarProps) {
  const isBlocked = permission === 'denied' || permission === 'unsupported';

  const statusSegments = [
    { label: isCameraDetected ? 'CAMERA_ACTIVE' : 'CAMERA_UNAVAILABLE', isOk: isCameraDetected },
    {
      label: isMicrophoneDetected ? 'MICROPHONE_INPUT_DETECTED' : 'MICROPHONE_UNAVAILABLE',
      isOk: isMicrophoneDetected,
    },
    {
      label: isAudioOutputDetected ? 'AUDIO_OUTPUT_READY' : 'AUDIO_OUTPUT_DEFAULT',
      isOk: isAudioOutputDetected,
    },
  ];

  return (
    <div
      className={cn(
        jetBrainsMono.className,
        'mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.05] py-4 text-[0.5rem] tracking-[0.12em]',
      )}
    >
      <span className="text-zinc-600">[DEVICE_SYSTEM]</span>

      {permission === 'requesting' && (
        <span className="text-cyan-400">REQUESTING_PERMISSION...</span>
      )}

      {isBlocked ? (
        <>
          <span className="text-fuchsia-400">
            {permission === 'denied' ? 'PERMISSION_DENIED' : 'DEVICE_API_UNSUPPORTED'}
          </span>
          {errorMessage && <span className="text-zinc-500">{errorMessage}</span>}
          {permission === 'denied' && (
            <button
              type="button"
              onClick={onRequestPermission}
              className="border border-white/10 px-2.5 py-1 tracking-[0.12em] text-zinc-300 transition-colors hover:border-cyan-300/50 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              RETRY_PERMISSION
            </button>
          )}
        </>
      ) : (
        permission === 'granted' &&
        statusSegments.map((segment) => (
          <span key={segment.label} className={segment.isOk ? 'text-zinc-500' : 'text-zinc-700'}>
            {segment.label}
            <span aria-hidden="true" className="ml-3 text-zinc-700">
              :
            </span>
          </span>
        ))
      )}

      <span aria-hidden="true" className="inline-block h-2.5 w-1.5 animate-pulse bg-zinc-600" />
    </div>
  );
}
