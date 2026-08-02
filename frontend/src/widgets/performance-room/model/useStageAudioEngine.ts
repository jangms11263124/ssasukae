import { useEffect } from 'react';

import { useDeviceSettingsStore } from '@/entities/media-device';
import { useVocalAudioEngine, type VocalAudioEngineState } from '@/features/vocal-audio-engine';

import { useStageStore } from './stageStore';

/**
 * 무대 상태를 도메인 무지인 오디오 엔진 훅에 연결한다 (useGestureDspControl과 같은 역할).
 * 가창자만, READY(MR 선로딩)~PERFORMING(재생) 동안만 엔진이 산다 — 청자는 비용 0.
 * SCORE 전이·방 이탈이면 enabled가 꺼지면서 소리 정지와 마이크 해제까지 정리된다.
 */
export function useStageAudioEngine(isPerformer: boolean): VocalAudioEngineState {
  const phase = useStageStore((state) => state.phase);
  const mrDownloadUrl = useStageStore((state) => state.mrDownloadUrl);
  const settings = useStageStore((state) => state.settings);
  const micOn = useStageStore((state) => state.micOn);

  const deviceSettings = useDeviceSettingsStore((state) => state.settings);
  const isHydrated = useDeviceSettingsStore((state) => state.isHydrated);
  const hydrate = useDeviceSettingsStore((state) => state.hydrate);

  // 설정 페이지를 거치지 않고 방에 들어와도 저장된 장치 선택이 적용되게 한다
  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  return useVocalAudioEngine({
    enabled: isPerformer && (phase === 'READY' || phase === 'PERFORMING'),
    mrUrl: mrDownloadUrl,
    playing: phase === 'PERFORMING',
    micOn,
    dsp: {
      keyOffset: settings.keyOffset,
      tempoPercent: settings.tempoPercent,
      echoLevel: settings.echoLevel,
      mrVolumePercent: settings.mrVolumePercent,
      micVolumePercent: settings.micVolumePercent,
    },
    micDeviceId: deviceSettings.microphoneId,
    speakerDeviceId: deviceSettings.speakerId,
  });
}
