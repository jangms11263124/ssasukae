import * as Tone from 'tone';

import {
  AUDIO_CONTEXT_SAMPLE_RATE,
  ECHO_DELAY_TIME,
  ECHO_FEEDBACK_PER_PERCENT,
  ECHO_WET_PER_PERCENT,
  PARAM_RAMP_SECONDS,
  PITCH_BYPASS_EPSILON,
  PITCH_SHIFT_WINDOW_SIZE,
  SILENCE_DB,
  VOCAL_ANALYSER_FFT_SIZE,
  VOCAL_CAPTURE_CONSTRAINTS,
} from '../config/audioEngineConfig';
import type { VocalAudioEngine, VocalDspValues } from './types';

/*
 * 오디오 그래프 (모니터/송출 믹스 분리):
 *
 *   mic ─┬────────→ FeedbackDelay(에코) → micGain ─┬→ monitorBus → 이어폰(ctx.destination)
 *        │                                        │
 *   MR(Player) ──→ PitchShift(음정)    → mrGain  ─┴→ broadcastBus → MediaStreamDestination
 *        │                                                           (→ OpenVidu publisher)
 *        └────────→ vocalAnalyser (음정 수집)
 *        └────────→ vocalTap → MediaStreamDestination (STT 녹음)
 *
 * 채점 탭 두 갈래는 에코·음량 이전의 드라이 목소리를 딴다 — 사용자가 만진 이펙트가 점수에 섞이면 안 된다.
 *
 * 모니터링은 WebRTC 루프백이 아니라 로컬 그래프에서 직접 딴다 — 지터 버퍼 지연이 없다.
 * 음정/템포는 MR 전용(PitchShift 지연 100ms가 목소리에 붙으면 노래를 못 부른다),
 * 에코는 목소리 전용이다.
 */

const DEFAULT_DSP: VocalDspValues = {
  keyOffset: 0,
  tempoPercent: 100,
  echoLevel: 0,
  mrVolumePercent: 100,
  micVolumePercent: 100,
};

/** AudioContext.setSinkId는 표준화 진행 중이라 lib.dom에 없을 수 있어 선택 멤버로 좁힌다 */
interface SinkSelectableContext extends AudioContext {
  setSinkId?: (sinkId: string) => Promise<void>;
}

function volumePercentToDb(percent: number): number {
  if (percent <= 0) return SILENCE_DB;

  return Math.max(SILENCE_DB, 20 * Math.log10(percent / 100));
}

function asFiniteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 비유한 값(undefined·NaN 등)이 램프 목표가 되면 RangeError로 터진다. 마지막 정상값으로 대체한다. */
function sanitizeDspValues(values: VocalDspValues, fallback: VocalDspValues): VocalDspValues {
  return {
    keyOffset: asFiniteNumber(values.keyOffset, fallback.keyOffset),
    // 0 이하 템포는 playbackRate·피치 보정(log2)을 무너뜨린다
    tempoPercent: Math.max(1, asFiniteNumber(values.tempoPercent, fallback.tempoPercent)),
    echoLevel: asFiniteNumber(values.echoLevel, fallback.echoLevel),
    mrVolumePercent: asFiniteNumber(values.mrVolumePercent, fallback.mrVolumePercent),
    micVolumePercent: asFiniteNumber(values.micVolumePercent, fallback.micVolumePercent),
  };
}

class ToneVocalAudioEngine implements VocalAudioEngine {
  private readonly context: SinkSelectableContext;
  /** 노드 생성 시점의 전역 컨텍스트. 이후 다른 엔진이 전역을 바꿔도 이 엔진의 노드는 여기 묶인다 */
  private readonly toneContext: ReturnType<typeof Tone.getContext>;

  private readonly monitorBus: Tone.Volume;
  private readonly broadcastBus: Tone.Volume;
  private readonly broadcastDestination: MediaStreamAudioDestinationNode;
  private readonly pitchShift: Tone.PitchShift;
  private readonly mrGain: Tone.Volume;
  private readonly echoDelay: Tone.FeedbackDelay;
  private readonly micGain: Tone.Volume;
  /** 채점용 드라이 탭. 마이크 노드와 달리 엔진 수명 내내 살아 있다 */
  private readonly vocalTap: MediaStreamAudioDestinationNode;
  private readonly vocalAnalyser: AnalyserNode;

  private player: Tone.Player | null = null;
  private mrUrl: string | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  /** openMic 경합 방지 — 가장 마지막 요청만 살아남는다 */
  private micRequestId = 0;

  /*
   * MR 시간축 추적: Tone.Player는 재생 위치를 알려주지 않아 직접 잰다.
   * 배속이 바뀌면 그 시점까지의 진행을 확정하고 앵커를 다시 잡는다 — 카드 효과로 템포가
   * 오르내려도 누적 위치가 어긋나지 않는다.
   */
  private mrAnchorSeconds = 0;
  private mrAnchorContextTime = 0;
  private mrPlaying = false;

  private lastDsp: VocalDspValues = DEFAULT_DSP;
  private disposed = false;
  private readonly resumeOnPointerDown = () => {
    void this.context.resume();
  };

  constructor(context: SinkSelectableContext) {
    this.context = context;
    this.toneContext = Tone.getContext();

    this.monitorBus = new Tone.Volume(0).toDestination();
    this.broadcastBus = new Tone.Volume(0);
    this.broadcastDestination = context.createMediaStreamDestination();
    this.broadcastBus.connect(this.broadcastDestination);
    // 음성용 적응 처리(VAD·잡음 억제 성향)를 피하고 반주 포함 믹스를 음악으로 인코딩하게 한다
    const [broadcastTrack] = this.broadcastDestination.stream.getAudioTracks();
    if (broadcastTrack !== undefined) {
      broadcastTrack.contentHint = 'music';
    }

    // MR 경로
    this.mrGain = new Tone.Volume(volumePercentToDb(DEFAULT_DSP.mrVolumePercent));
    this.mrGain.fan(this.monitorBus, this.broadcastBus);
    this.pitchShift = new Tone.PitchShift({
      pitch: 0,
      windowSize: PITCH_SHIFT_WINDOW_SIZE,
      delayTime: 0,
      feedback: 0,
    });
    this.pitchShift.connect(this.mrGain);
    // 순 피치 0에서는 그래뉼러 아티팩트를 피하려고 드라이 통과시킨다
    this.pitchShift.wet.value = 0;

    // 목소리 경로
    this.micGain = new Tone.Volume(volumePercentToDb(DEFAULT_DSP.micVolumePercent));
    this.micGain.fan(this.monitorBus, this.broadcastBus);
    this.echoDelay = new Tone.FeedbackDelay({ delayTime: ECHO_DELAY_TIME, feedback: 0, wet: 0 });
    this.echoDelay.connect(this.micGain);

    // 채점 탭. 여기에는 아무것도 연결하지 않아 소리로 나가지 않는다 (분석·녹음 전용).
    this.vocalTap = context.createMediaStreamDestination();
    this.vocalAnalyser = context.createAnalyser();
    this.vocalAnalyser.fftSize = VOCAL_ANALYSER_FFT_SIZE;

    // 자동재생 정책으로 suspended면 다음 클릭에서 살린다
    if (context.state !== 'running') {
      document.addEventListener('pointerdown', this.resumeOnPointerDown, { once: true });
    }
  }

  async loadMr(url: string): Promise<void> {
    if (this.mrUrl === url && this.player !== null) return;

    this.stopMr();
    this.player?.dispose();
    this.player = null;
    this.mrUrl = null;
    // 곡이 바뀌면 이전 곡의 재생 위치는 의미가 없다.
    this.mrAnchorSeconds = 0;
    this.mrPlaying = false;

    const buffer = await new Tone.ToneAudioBuffer().load(url);
    if (this.disposed) return;

    // 전역 컨텍스트가 바뀌었을 수 있어 생성 시점 컨텍스트를 명시한다
    const player = new Tone.Player({ context: this.toneContext });
    player.buffer = buffer;
    player.loop = false;
    player.connect(this.pitchShift);
    this.player = player;
    this.mrUrl = url;

    // 로드 전에 들어온 설정(템포 등)을 플레이어에 반영한다
    this.applyDsp(this.lastDsp);
  }

  startMr(offsetSeconds?: number): void {
    if (this.disposed || this.player === null || this.player.state === 'started') return;
    // 곡 길이를 넘는 오프셋으로 시작하면 Tone이 예외를 던진다.
    const duration = this.player.buffer.duration;
    const offset =
      offsetSeconds !== undefined && offsetSeconds > 0
        ? Math.min(offsetSeconds, duration)
        : undefined;
    this.player.start(undefined, offset);
    this.mrAnchorSeconds = offset ?? 0;
    this.mrAnchorContextTime = this.context.currentTime;
    this.mrPlaying = true;
    // 지연 분해 진단용 — base는 브라우저 버퍼, output은 OS 오디오 스택. 실기 검증 후 제거 예정.
    console.info(
      `[vocal-audio-engine] baseLatency=${Math.round(this.context.baseLatency * 1000)}ms outputLatency=${Math.round((this.context.outputLatency || 0) * 1000)}ms`,
    );
  }

  stopMr(): void {
    if (this.player === null || this.player.state !== 'started') return;
    // 멈춘 위치를 확정해 둔다. 일시 중지 뒤에도 마지막 위치를 물어볼 수 있어야 한다.
    this.mrAnchorSeconds = this.mrPositionSeconds();
    this.mrPlaying = false;
    this.player.stop();
  }

  /** 앵커 이후 흐른 컨텍스트 시간에 배속을 곱해 MR 시간축 위치를 낸다 */
  private mrPositionSeconds(): number {
    if (!this.mrPlaying || this.player === null) return this.mrAnchorSeconds;

    const elapsed = this.context.currentTime - this.mrAnchorContextTime;
    const position = this.mrAnchorSeconds + elapsed * this.player.playbackRate;

    // 곡이 끝나도 컨텍스트 시계는 계속 흐른다. 곡 길이를 넘는 위치를 주지 않는다.
    return Math.min(position, this.player.buffer.duration);
  }

  getMrPositionMs(): number {
    return this.mrPositionSeconds() * 1000;
  }

  async openMic(deviceId: string): Promise<void> {
    if (this.disposed) return;
    this.closeMic();
    const requestId = ++this.micRequestId;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...VOCAL_CAPTURE_CONSTRAINTS,
        ...(deviceId !== '' ? { deviceId: { exact: deviceId } } : {}),
      },
    });

    if (this.disposed || requestId !== this.micRequestId) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.micStream = stream;
    this.micSource = this.context.createMediaStreamSource(stream);
    Tone.connect(this.micSource, this.echoDelay);
    // 채점 탭은 에코 앞에서 갈라진다 — 사용자가 건 이펙트가 STT·음정 분석에 섞이지 않는다.
    this.micSource.connect(this.vocalAnalyser);
    this.micSource.connect(this.vocalTap);
  }

  closeMic(): void {
    this.micRequestId += 1;
    this.micSource?.disconnect();
    this.micSource = null;
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
  }

  applyDsp(values: VocalDspValues): void {
    const safe = sanitizeDspValues(values, this.lastDsp);
    this.lastDsp = safe;
    // 정리와 설정 반영이 같은 렌더에 겹치면 파기된 노드의 램프 호출로 죽을 수 있다
    if (this.disposed) return;

    const speedMultiplier = safe.tempoPercent / 100;
    if (this.player !== null) {
      // 배속을 바꾸기 전에 지금까지의 진행을 옛 배속으로 확정해 둔다.
      if (this.mrPlaying && this.player.playbackRate !== speedMultiplier) {
        this.mrAnchorSeconds = this.mrPositionSeconds();
        this.mrAnchorContextTime = this.context.currentTime;
      }
      this.player.playbackRate = speedMultiplier;
    }

    // playbackRate가 키를 함께 올리므로 상쇄해서 "템포만 바뀌고 키는 그대로"를 만든다
    const pitchCompensation = -12 * Math.log2(speedMultiplier);
    const netPitch = safe.keyOffset + pitchCompensation;
    if (Math.abs(netPitch) < PITCH_BYPASS_EPSILON) {
      this.pitchShift.wet.rampTo(0, PARAM_RAMP_SECONDS);
    } else {
      this.pitchShift.pitch = netPitch;
      this.pitchShift.wet.rampTo(1, PARAM_RAMP_SECONDS);
    }

    this.echoDelay.feedback.rampTo(safe.echoLevel * ECHO_FEEDBACK_PER_PERCENT, PARAM_RAMP_SECONDS);
    this.echoDelay.wet.rampTo(safe.echoLevel * ECHO_WET_PER_PERCENT, PARAM_RAMP_SECONDS);

    this.mrGain.volume.rampTo(volumePercentToDb(safe.mrVolumePercent), PARAM_RAMP_SECONDS);
    this.micGain.volume.rampTo(volumePercentToDb(safe.micVolumePercent), PARAM_RAMP_SECONDS);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (this.disposed || typeof this.context.setSinkId !== 'function') return;
    // 빈 문자열은 시스템 기본 장치로 되돌린다
    await this.context.setSinkId(deviceId);
  }

  getBroadcastStream(): MediaStream {
    return this.broadcastDestination.stream;
  }

  getVocalCaptureStream(): MediaStream {
    return this.vocalTap.stream;
  }

  getVocalAnalyser(): AnalyserNode {
    return this.vocalAnalyser;
  }

  getLatencyMs(): number | null {
    const { baseLatency, outputLatency } = this.context;
    if (typeof baseLatency !== 'number') return null;

    return Math.round((baseLatency + (outputLatency || 0)) * 1000);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    document.removeEventListener('pointerdown', this.resumeOnPointerDown);
    this.closeMic();
    this.player?.dispose();
    this.player = null;
    this.pitchShift.dispose();
    this.mrGain.dispose();
    this.echoDelay.dispose();
    this.micGain.dispose();
    this.monitorBus.dispose();
    this.broadcastBus.dispose();
    this.broadcastDestination.disconnect();
    this.vocalAnalyser.disconnect();
    this.vocalTap.disconnect();
    void this.context.close();
  }
}

export async function createVocalAudioEngine(): Promise<VocalAudioEngine> {
  const context = new AudioContext({
    sampleRate: AUDIO_CONTEXT_SAMPLE_RATE,
    latencyHint: 'interactive',
  });
  // setContext와 노드 생성 사이에 await를 두지 않는다 — 엔진이 겹쳐 만들어져도
  // (React StrictMode 이중 마운트) 노드가 다른 컨텍스트에 섞이지 않는다.
  Tone.setContext(context);
  const engine = new ToneVocalAudioEngine(context);

  // 방 진입까지의 클릭으로 사용자 활성화가 있으면 즉시 살아난다
  await context.resume().catch(() => undefined);

  return engine;
}
