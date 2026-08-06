'use client';

import { resolveDeviceId, useMediaDevices } from '@/entities/media-device';
import { showToast } from '@/shared/model/toastStore';
import { ActionButton } from '@/shared/ui/button/ActionButton';

import { useDeviceSettingsDraft } from '../model/useDeviceSettingsDraft';
import { AudioInputCard } from './AudioInputCard';
import { AudioOutputCard } from './AudioOutputCard';
import { DeviceSystemStatusBar } from './DeviceSystemStatusBar';
import { VideoSettingsCard } from './VideoSettingsCard';

/** 기기 설정 본문만 담당. 헤더·푸터·배경 셸은 서버 페이지에 둔다. */
export function DeviceSettingsPanel() {
  const { devices, permission, errorMessage, canSelectAudioOutput, requestPermission } =
    useMediaDevices();
  const { draft, hasUnsavedChanges, updateDraft, saveDraft, resetDraft } = useDeviceSettingsDraft();

  const handleSave = () => {
    saveDraft();
    showToast('기기 설정을 저장했어요.');
  };

  const handleReset = () => {
    resetDraft();
    showToast('기기 설정을 기본값으로 되돌렸어요.');
  };

  const isReady = permission === 'granted';
  const cameraId = resolveDeviceId(draft.cameraId, devices.cameras);
  const microphoneId = resolveDeviceId(draft.microphoneId, devices.microphones);
  const speakerId = resolveDeviceId(draft.speakerId, devices.speakers);

  return (
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
  );
}
