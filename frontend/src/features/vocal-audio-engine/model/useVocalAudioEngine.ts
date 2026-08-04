import { useCallback, useEffect, useRef, useState } from 'react';

import type { VocalAudioEngine, VocalDspValues } from './types';

export interface UseVocalAudioEngineOptions {
  /** false면 엔진을 만들지 않고, 살아 있던 엔진은 정리한다 */
  enabled: boolean;
  mrUrl: string | null;
  /** MR 재생 여부. 마이크도 재생 중에만 연다 */
  playing: boolean;
  /** 재생 시작 위치(ms). 공연 재개 시 서버가 내려준 위치를 넘긴다. 기본 0(처음부터) */
  startOffsetMs?: number;
  micOn: boolean;
  dsp: VocalDspValues;
  /** 빈 문자열이면 시스템 기본 장치 */
  micDeviceId: string;
  speakerDeviceId: string;
  /** MR이 끝까지 재생돼 스스로 멈추면 호출된다. 정지/정리로 멈춘 경우는 제외 */
  onMrEnded?: () => void;
}

export interface VocalAudioEngineState {
  isEngineReady: boolean;
  isMrLoaded: boolean;
  error: string | null;
  /** 같은 MR을 처음부터 다시 내려받는다. 로딩 실패 후 재시도 버튼이 쓴다 */
  retryLoadMr: () => void;
  /** 송출 믹스. OpenVidu publisher 연동 시 이 스트림의 오디오 트랙을 넘긴다 */
  getBroadcastStream: () => MediaStream | null;
  /**
   * 살아 있는 엔진 인스턴스. 채점 수집처럼 마이크 탭·MR 시간축을 엔진과 같은 수명으로
   * 붙잡아야 하는 쪽이 의존성으로 쓴다 (엔진이 새로 만들어지면 참조가 바뀐다).
   */
  engine: VocalAudioEngine | null;
}

/**
 * 엔진 수명주기를 React에 묶는 훅. Tone.js(수십 KB)는 엔진이 실제로 필요할 때만
 * 동적 import로 내려받는다 — enabled가 한 번도 true가 안 되면 번들 비용이 없다.
 */
export function useVocalAudioEngine(options: UseVocalAudioEngineOptions): VocalAudioEngineState {
  const {
    enabled,
    mrUrl,
    playing,
    startOffsetMs = 0,
    micOn,
    micDeviceId,
    speakerDeviceId,
    dsp,
    onMrEnded,
  } = options;
  const { keyOffset, tempoPercent, echoLevel, mrVolumePercent, micVolumePercent, monitorVoicePercent } = dsp;

  const [engine, setEngine] = useState<VocalAudioEngine | null>(null);
  const [isMrLoaded, setIsMrLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 엔진 생성/파기
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let created: VocalAudioEngine | null = null;

    import('./createVocalAudioEngine')
      .then((mod) => mod.createVocalAudioEngine())
      .then((instance) => {
        if (cancelled) {
          instance.dispose();
          return;
        }
        created = instance;
        setEngine(instance);
      })
      .catch(() => {
        if (!cancelled) setError('오디오 엔진을 초기화하지 못했습니다.');
      });

    return () => {
      cancelled = true;
      created?.dispose();
      setEngine(null);
      setIsMrLoaded(false);
      setError(null);
    };
  }, [enabled]);

  // 자연 종료 콜백. 엔진 생성마다 한 번만 등록하고 최신 콜백은 ref로 따라간다 —
  // 콜백 아이덴티티가 바뀔 때마다 재등록하지 않는다.
  const onMrEndedRef = useRef(onMrEnded);
  useEffect(() => {
    onMrEndedRef.current = onMrEnded;
  });
  useEffect(() => {
    if (engine === null) return;

    engine.setOnMrEnded(() => onMrEndedRef.current?.());

    return () => {
      engine.setOnMrEnded(null);
    };
  }, [engine]);

  const runMrLoad = useCallback(
    (target: VocalAudioEngine, url: string, isCancelled: () => boolean) => {
      target
        .loadMr(url)
        .then(() => {
          if (!isCancelled()) setIsMrLoaded(true);
        })
        .catch(() => {
          if (!isCancelled()) setError('MR을 불러오지 못했습니다.');
        });
    },
    [],
  );

  // MR 로딩 (시작 요청 시점에 내려받는다)
  useEffect(() => {
    if (engine === null || mrUrl === null) return;

    let cancelled = false;

    runMrLoad(engine, mrUrl, () => cancelled);

    return () => {
      cancelled = true;
      setIsMrLoaded(false);
    };
  }, [engine, mrUrl, runMrLoad]);

  // 실패 후 재시도. 노래를 바꾸지 않아도 같은 MR을 다시 내려받을 수 있어야 한다.
  const retryLoadMr = useCallback(() => {
    if (engine === null || mrUrl === null) return;

    setError(null);
    setIsMrLoaded(false);
    runMrLoad(engine, mrUrl, () => false);
  }, [engine, mrUrl, runMrLoad]);

  // MR 재생/정지. startOffsetMs는 일시 중지→재개 전이에서만 바뀌므로
  // deps에 넣어도 재생 중 재시작이 일어나지 않는다.
  useEffect(() => {
    if (engine === null || !isMrLoaded || !playing) return;

    engine.startMr(startOffsetMs > 0 ? startOffsetMs / 1000 : undefined);
    // 완료 조건의 모니터링 지연 측정 기록용. 실기 검증 후 제거해도 된다.
    console.info(`[vocal-audio-engine] 모니터링 지연 ≈ ${engine.getLatencyMs() ?? '측정 불가'}ms`);

    return () => {
      engine.stopMr();
    };
  }, [engine, isMrLoaded, playing, startOffsetMs]);

  // 마이크 열기/닫기 — 실패해도 MR 재생은 계속돼야 하므로 에러만 남긴다
  useEffect(() => {
    if (engine === null || !playing || !micOn) return;

    engine.openMic(micDeviceId).catch(() => {
      setError('마이크를 열지 못했습니다. 장치 권한을 확인해 주세요.');
    });

    return () => {
      engine.closeMic();
    };
  }, [engine, playing, micOn, micDeviceId]);

  // 설정값 반영 — 값 변화마다 램프로 부드럽게 따라간다
  useEffect(() => {
    engine?.applyDsp({ keyOffset, tempoPercent, echoLevel, mrVolumePercent, micVolumePercent, monitorVoicePercent });
  }, [engine, keyOffset, tempoPercent, echoLevel, mrVolumePercent, micVolumePercent, monitorVoicePercent]);

  // 모니터 출력 장치 — 미지원 브라우저·장치 소실은 무시하고 기본 출력을 쓴다
  useEffect(() => {
    engine?.setOutputDevice(speakerDeviceId).catch(() => undefined);
  }, [engine, speakerDeviceId]);

  const getBroadcastStream = useCallback(
    () => (engine === null ? null : engine.getBroadcastStream()),
    [engine],
  );

  return {
    isEngineReady: engine !== null,
    isMrLoaded,
    error,
    retryLoadMr,
    getBroadcastStream,
    engine,
  };
}
