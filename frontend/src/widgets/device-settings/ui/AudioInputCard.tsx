'use client';

import type { MediaDeviceOption } from '@/entities/media-device';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';
import { ActionButton } from '@/shared/ui/button/ActionButton';
import { NeonSelect } from '@/shared/ui/select/NeonSelect';
import { SettingsPanel } from '@/shared/ui/panel/SettingsPanel';

import { toSelectOptions } from '../lib/toSelectOptions';
import { useMicLevelMeter } from '../model/useMicLevelMeter';
import {
  RECORD_DURATION_MS,
  useMicrophoneTest,
  type MicrophoneTestPhase,
} from '../model/useMicrophoneTest';
import { InputLevelMeter } from './InputLevelMeter';
import { MicrophoneIcon } from './icons';
import { RecordingProgressBar } from './RecordingProgressBar';

interface AudioInputCardProps {
  microphones: MediaDeviceOption[];
  microphoneId: string;
  speakerId: string;
  outputVolume: number;
  isMicrophoneReady: boolean;
  onMicrophoneChange: (microphoneId: string) => void;
}

const TEST_BUTTON_LABEL: Record<MicrophoneTestPhase, string> = {
  idle: 'TEST MICROPHONE',
  preparing: 'PREPARING...',
  recording: 'RECORDING...',
  playing: 'PLAYING BACK...',
};

export function AudioInputCard({
  microphones,
  microphoneId,
  speakerId,
  outputVolume,
  isMicrophoneReady,
  onMicrophoneChange,
}: AudioInputCardProps) {
  const { phase, errorMessage, remainingMs, startTest } = useMicrophoneTest({
    microphoneId,
    speakerId,
    outputVolume,
  });

  // 테스트용 스트림을 열기 전에 미터 쪽 스트림을 놓아야 같은 마이크를 두 번 점유하지 않는다.
  const { levelDb, isMeasuring } = useMicLevelMeter({
    microphoneId,
    isEnabled: isMicrophoneReady && phase !== 'preparing' && phase !== 'recording',
  });

  const hasNoMicrophone = microphones.length === 0;

  return (
    <SettingsPanel title="AUDIO INPUTS" icon={<MicrophoneIcon />}>
      <div className="mt-6">
        <NeonSelect
          id="microphone-selection"
          label="MICROPHONE SELECTION"
          value={microphoneId}
          options={toSelectOptions(microphones)}
          onChange={onMicrophoneChange}
          emptyLabel="NO_MICROPHONE_DETECTED"
        />
      </div>

      <InputLevelMeter levelDb={levelDb} isMeasuring={isMeasuring} />

      <ActionButton
        onClick={() => void startTest()}
        disabled={!isMicrophoneReady || hasNoMicrophone || phase !== 'idle'}
        className="mt-7 w-full"
      >
        <span aria-hidden="true">▶</span>
        {TEST_BUTTON_LABEL[phase]}
      </ActionButton>

      <RecordingProgressBar
        isRecording={phase === 'recording'}
        remainingMs={remainingMs}
        totalMs={RECORD_DURATION_MS}
      />

      {errorMessage && (
        <p
          className={cn(
            jetBrainsMono.className,
            'mt-3 text-[0.5rem] leading-relaxed tracking-[0.12em] text-fuchsia-400',
          )}
        >
          [ERROR] {errorMessage}
        </p>
      )}
    </SettingsPanel>
  );
}
