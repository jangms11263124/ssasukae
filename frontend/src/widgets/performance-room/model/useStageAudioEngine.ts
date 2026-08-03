import { useEffect } from 'react';

import { useDeviceSettingsStore } from '@/entities/media-device';
import { useVocalAudioEngine, type VocalAudioEngineState } from '@/features/vocal-audio-engine';

import { TEMPO_STEP_PERCENT } from '../config/dspParams';
import { useCardStore } from './cardStore';
import { useOpenViduSessionContext } from './OpenViduSessionContext';
import { useStageStore } from './stageStore';

const KEY_OFFSET_MIN = -6;
const KEY_OFFSET_MAX = 6;
const TEMPO_PERCENT_MIN = 50;
const TEMPO_PERCENT_MAX = 150;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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
  const isSuspended = useStageStore((state) => state.isSuspended);
  const resumeOffsetMs = useStageStore((state) => state.resumeOffsetMs);
  const activeEffect = useCardStore((state) => state.activeEffect);

  // 수성전 공격 카드: 가창자 대상 키/템포 효과를 서버와 같은 식(base + value, clamp)으로 겹친다.
  // 기본 설정(stageStore.settings)은 건드리지 않으므로 CARD_EFFECT_ENDED로 효과가 사라지면 자동 복구된다.
  let keyOffset = settings.keyOffset;
  let tempoPercent = settings.tempoPercent;
  if (
    activeEffect !== null &&
    activeEffect.targetType === 'PERFORMER' &&
    activeEffect.effectValue !== null
  ) {
    if (activeEffect.effectType === 'MR_KEY_CHANGE') {
      keyOffset = clamp(settings.keyOffset + activeEffect.effectValue, KEY_OFFSET_MIN, KEY_OFFSET_MAX);
    } else if (activeEffect.effectType === 'MR_TEMPO_CHANGE') {
      tempoPercent = clamp(
        settings.tempoPercent + activeEffect.effectValue * TEMPO_STEP_PERCENT,
        TEMPO_PERCENT_MIN,
        TEMPO_PERCENT_MAX,
      );
    }
  }

  const deviceSettings = useDeviceSettingsStore((state) => state.settings);
  const isHydrated = useDeviceSettingsStore((state) => state.isHydrated);
  const hydrate = useDeviceSettingsStore((state) => state.hydrate);

  // 설정 페이지를 거치지 않고 방에 들어와도 저장된 장치 선택이 적용되게 한다
  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  const engine = useVocalAudioEngine({
    enabled: isPerformer && (phase === 'READY' || phase === 'PERFORMING'),
    mrUrl: mrDownloadUrl,
    // 일시 중지 동안 MR을 멈췄다가 재개 이벤트가 오면 서버가 준 위치부터 이어 재생한다.
    playing: phase === 'PERFORMING' && !isSuspended,
    startOffsetMs: resumeOffsetMs,
    micOn,
    dsp: {
      keyOffset,
      tempoPercent,
      echoLevel: settings.echoLevel,
      mrVolumePercent: settings.mrVolumePercent,
      micVolumePercent: settings.micVolumePercent,
    },
    micDeviceId: deviceSettings.microphoneId,
    speakerDeviceId: deviceSettings.speakerId,
  });

  const { replaceAudioTrack } = useOpenViduSessionContext();
  const { getBroadcastStream } = engine;
  const isBroadcastingMix = isPerformer && phase === 'PERFORMING';

  // 공연 중 송출 오디오를 원본 마이크 대신 엔진 믹스(목소리+에코+MR)로 교체한다.
  // 원본 마이크는 AEC가 모니터링되는 자기 목소리를 에코로 오인해 상쇄한다 (MR 볼륨↓ 시 목소리 소실).
  useEffect(() => {
    if (!isBroadcastingMix) return;
    const track = getBroadcastStream()?.getAudioTracks()[0];
    if (track === undefined) return;

    void replaceAudioTrack(track);

    return () => {
      void replaceAudioTrack(null);
    };
  }, [isBroadcastingMix, getBroadcastStream, replaceAudioTrack]);

  return engine;
}
