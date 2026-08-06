import { useCallback, useEffect } from 'react';

import { useDeviceSettingsStore } from '@/entities/media-device';
import { useVocalAudioEngine, type VocalAudioEngineState } from '@/features/vocal-audio-engine';

import { useCardStore } from './cardStore';
import { resolveEffectiveSettings } from './effectiveSettings';
import { useOpenViduSessionContext } from './OpenViduSessionContext';
import { useRoomSocketContext } from './RoomSocketContext';
import { useStageStore } from './stageStore';

/**
 * 무대 상태를 도메인 무지인 오디오 엔진 훅에 연결한다 (useGestureDspControl과 같은 역할).
 * 가창자만, READY(MR 선로딩)~PERFORMING(재생) 동안만 엔진이 산다 — 청자는 비용 0.
 * SCORE 전이·방 이탈이면 enabled가 꺼지면서 소리 정지와 마이크 해제까지 정리된다.
 */
export function useStageAudioEngine(isPerformer: boolean): VocalAudioEngineState {
  const phase = useStageStore((state) => state.phase);
  const mrLoadRequested = useStageStore((state) => state.mrLoadRequested);
  const mrDownloadUrl = useStageStore((state) => state.mrDownloadUrl);
  const settings = useStageStore((state) => state.settings);
  const micOn = useStageStore((state) => state.micOn);
  const isSuspended = useStageStore((state) => state.isSuspended);
  const resumeOffsetMs = useStageStore((state) => state.resumeOffsetMs);
  const activeEffect = useCardStore((state) => state.activeEffect);

  // 수성전 공격 카드의 키/템포 효과를 겹친다. 가사 시계·무대 표시도 같은 값을 본다.
  const { keyOffset, tempoPercent } = resolveEffectiveSettings(settings, activeEffect);

  const deviceSettings = useDeviceSettingsStore((state) => state.settings);
  const isHydrated = useDeviceSettingsStore((state) => state.isHydrated);
  const hydrate = useDeviceSettingsStore((state) => state.hydrate);

  // 설정 페이지를 거치지 않고 방에 들어와도 저장된 장치 선택이 적용되게 한다
  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  const socket = useRoomSocketContext();

  // MR이 끝까지 재생되면 가창자가 정상 종료를 알리고 채점 단계로 전이한다.
  // 중도 취소(버튼·제스처)는 cancel을 보내므로 playback/finish는 여기서만 나간다.
  // 조건은 전송 시점 기준이어야 해서 스토어를 구독하지 않고 직접 읽는다.
  const handleMrEnded = useCallback(() => {
    const stage = useStageStore.getState();
    if (stage.phase !== 'PERFORMING' || stage.isSuspended) return;

    socket.sendPlaybackFinish();
    stage.applyPlaybackFinished();
  }, [socket]);

  const engine = useVocalAudioEngine({
    enabled: isPerformer && (phase === 'READY' || phase === 'PERFORMING'),
    // 노래 바꾸기로 선곡이 반복될 수 있어 READY 진입만으로는 MR을 내려받지 않는다.
    // 시작 요청 후에 받고, 재접속 복원(PERFORMING 진입)은 재개에 필요하므로 바로 받는다.
    mrUrl: mrLoadRequested || phase === 'PERFORMING' ? mrDownloadUrl : null,
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
      monitorVoicePercent: settings.monitorVoicePercent,
    },
    micDeviceId: deviceSettings.microphoneId,
    speakerDeviceId: deviceSettings.speakerId,
    onMrEnded: handleMrEnded,
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
