'use client';

import { resolveDeviceId, useMediaDevices } from '@/entities/media-device';
import { showToast } from '@/shared/model/toastStore';
import { AuthenticatedHeader } from '@/widgets/authenticated-header';

import { useDeviceSettingsDraft } from '../model/useDeviceSettingsDraft';
import { ActionButton } from './ActionButton';
import { AudioInputCard } from './AudioInputCard';
import { AudioOutputCard } from './AudioOutputCard';
import { DeviceSystemStatusBar } from './DeviceSystemStatusBar';
import { VideoSettingsCard } from './VideoSettingsCard';

export function DeviceSettingsPanel() {
  const { devices, permission, errorMessage, canSelectAudioOutput, requestPermission } =
    useMediaDevices();
  const { draft, hasUnsavedChanges, updateDraft, saveDraft, resetDraft } = useDeviceSettingsDraft();

  const handleSave = () => {
    saveDraft();
    showToast('기기 설정을 저장했습니다.');
  };

  const handleReset = () => {
    resetDraft();
    showToast('기기 설정을 기본값으로 되돌렸습니다.');
  };

  const isReady = permission === 'granted';
  const cameraId = resolveDeviceId(draft.cameraId, devices.cameras);
  const microphoneId = resolveDeviceId(draft.microphoneId, devices.microphones);
  const speakerId = resolveDeviceId(draft.speakerId, devices.speakers);

  return (
    <div className="min-h-dvh bg-[#08090c] text-white">
      <div className="flex min-h-dvh flex-col">
        <AuthenticatedHeader />

        <main className="relative flex-1 overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_40%_10%,rgba(255,255,255,0.035),transparent_30%),linear-gradient(110deg,#101010_0%,#08090c_58%,#090b10_100%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_3px,rgba(255,255,255,0.01)_4px)]"
          />

          <div className="relative mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(22rem,1fr)]">
              <VideoSettingsCard
                cameras={devices.cameras}
                cameraId={cameraId}
                resolution={draft.resolution}
                isMirrored={draft.isMirrored}
                isCameraReady={isReady && devices.cameras.length > 0}
                onCameraChange={(nextId) => updateDraft('cameraId', nextId)}
                onResolutionChange={(resolution) => updateDraft('resolution', resolution)}
                onMirroredChange={(isMirrored) => updateDraft('isMirrored', isMirrored)}
              />

              <div className="flex flex-col gap-4">
                <AudioInputCard
                  microphones={devices.microphones}
                  microphoneId={microphoneId}
                  speakerId={speakerId}
                  outputVolume={draft.outputVolume}
                  isMicrophoneReady={isReady && devices.microphones.length > 0}
                  onMicrophoneChange={(nextId) => updateDraft('microphoneId', nextId)}
                />

                <AudioOutputCard
                  speakers={devices.speakers}
                  speakerId={speakerId}
                  outputVolume={draft.outputVolume}
                  canSelectAudioOutput={canSelectAudioOutput}
                  onSpeakerChange={(nextId) => updateDraft('speakerId', nextId)}
                  onVolumeChange={(outputVolume) => updateDraft('outputVolume', outputVolume)}
                />

                <div className="flex justify-end gap-3">
                  <ActionButton onClick={handleReset} className="w-40">
                    RESET TO DEFAULT
                  </ActionButton>

                  <ActionButton
                    variant="primary"
                    onClick={handleSave}
                    disabled={!hasUnsavedChanges}
                    className="w-40"
                  >
                    SAVE CHANGES
                  </ActionButton>
                </div>
              </div>
            </div>

            <DeviceSystemStatusBar
              permission={permission}
              errorMessage={errorMessage}
              isCameraDetected={devices.cameras.length > 0}
              isMicrophoneDetected={devices.microphones.length > 0}
              isAudioOutputDetected={devices.speakers.length > 0}
              onRequestPermission={() => void requestPermission()}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
