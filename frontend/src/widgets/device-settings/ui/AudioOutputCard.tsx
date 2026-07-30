'use client';

import type { MediaDeviceOption } from '@/entities/media-device';
import { NeonSelect } from '@/shared/ui/select/NeonSelect';
import { ActionButton } from '@/shared/ui/button/ActionButton';
import { SettingsPanel } from '@/shared/ui/panel/SettingsPanel';

import { toSelectOptions } from '../lib/toSelectOptions';
import { useAudioOutputTest } from '../model/useAudioOutputTest';
import { SpeakerIcon, VolumeIcon } from './icons';
import { VolumeSlider } from './VolumeSlider';

interface AudioOutputCardProps {
  speakers: MediaDeviceOption[];
  speakerId: string;
  outputVolume: number;
  canSelectAudioOutput: boolean;
  onSpeakerChange: (speakerId: string) => void;
  onVolumeChange: (outputVolume: number) => void;
}

const UNSUPPORTED_HINT =
  '이 브라우저는 출력 기기 선택을 지원하지 않아 시스템 기본 기기로 재생됩니다.';

export function AudioOutputCard({
  speakers,
  speakerId,
  outputVolume,
  canSelectAudioOutput,
  onSpeakerChange,
  onVolumeChange,
}: AudioOutputCardProps) {
  const { isPlaying, playTestTone } = useAudioOutputTest({ speakerId, outputVolume });

  return (
    <SettingsPanel title="AUDIO OUTPUT" icon={<SpeakerIcon />}>
      <div className="mt-6">
        <NeonSelect
          id="speaker-selection"
          label="SPEAKER / HEADPHONE"
          value={speakerId}
          options={toSelectOptions(speakers)}
          onChange={onSpeakerChange}
          isDisabled={!canSelectAudioOutput}
          hint={canSelectAudioOutput ? undefined : UNSUPPORTED_HINT}
          emptyLabel="NO_OUTPUT_DETECTED"
        />
      </div>

      <div className="mt-7">
        <VolumeSlider
          id="output-volume"
          label="OUTPUT VOLUME"
          value={outputVolume}
          onChange={onVolumeChange}
        />
      </div>

      <ActionButton
        onClick={() => void playTestTone()}
        disabled={isPlaying}
        className="mt-7 w-full"
      >
        <VolumeIcon />
        {isPlaying ? 'PLAYING TONE...' : 'TEST OUTPUT'}
      </ActionButton>
    </SettingsPanel>
  );
}
