import * as Tone from 'tone';

import type { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import type { SoundTouchNode } from '@soundtouchjs/audio-worklet';

import {
  AUDIO_CONTEXT_SAMPLE_RATE,
  BROADCAST_LIMITER_THRESHOLD_DB,
  BROADCAST_MR_SYNC_MAX_DELAY_SECONDS,
  BROADCAST_MR_TRIM_DB,
  BROADCAST_VOICE_COMPRESSOR,
  BROADCAST_VOICE_MAKEUP_DB,
  MIC_INPUT_LATENCY_ESTIMATE_SECONDS,
  PARAM_RAMP_SECONDS,
  RNNOISE_LATENCY_SECONDS,
  RNNOISE_WASM_SIMD_URL,
  RNNOISE_WASM_URL,
  RNNOISE_WORKLET_URL,
  ECHO_DECAY_SECONDS,
  ECHO_PRE_DELAY_SECONDS,
  ECHO_WET_MAX,
  PITCH_BYPASS_EPSILON,
  PITCH_SHIFT_WINDOW_SIZE,
  SILENCE_DB,
  SOUNDTOUCH_MR_LATENCY_SECONDS,
  VOCAL_ANALYSER_FFT_SIZE,
  VOCAL_CAPTURE_CONSTRAINTS,
} from '../config/audioEngineConfig';
import type { VocalAudioEngine, VocalDspValues } from './types';
import {
  applySoundTouchTempoParams,
  createSoundTouchMrNode,
  decodeMrBuffer,
  registerSoundTouchWorklet,
  shouldUseSoundTouchStretch,
} from './soundTouchMr';

/*
 * 오디오 그래프 (모니터/송출 믹스 분리):
 *
 *   [송출]  mic(NS) → voiceEcho(울림) → Compressor → micGain ─┐
 *           mrGain → broadcastMrDelay(싱크) → mrBroadcastTrim ─────┴→ broadcastBus
 *                  → Limiter → MediaStreamDestination (→ OpenVidu publisher)
 *
 *   [모니터] mic(원음) → monitorVoiceDelay(싱크) → monitorVoiceEcho → monitorVoiceGain ─┐
 *           MR(BufferSource) → [SoundTouch@≠100%] → PitchShift(키) → mrGain ────────────┴→ monitorBus
 *
 *   [채점]  mic(NS) ─┬→ vocalAnalyser (음정 수집)
 *                    └→ vocalTap → MediaStreamDestination (STT 녹음)
 *
 * 채점 탭 두 갈래는 에코·음량 이전의 드라이 목소리를 딴다 — 사용자가 만진 이펙트가 점수에 섞이면 안 된다.
 *
 * 모니터링은 WebRTC 루프백이 아니라 로컬 그래프에서 직접 딴다 — 지터 버퍼 지연이 없다.
 * MR 템포(100% 제외)는 SoundTouch WSOLA, 키는 PitchShift. stretch 시 처리 지연만큼 모니터 목소리를 늦춘다.
 * 에코는 목소리 전용이다.
 *
 * 송출 전용 보정(컴프레서·메이크업 게인·MR 트림·리미터)은 모니터 경로에 걸지 않는다 —
 * 가창자가 듣는 소리는 그대로 두고, 청자가 듣는 목소리 크기만 마이크 트랙 시절과 맞춘다.
 */

const DEFAULT_DSP: VocalDspValues = {
  keyOffset: 0,
  tempoPercent: 100,
  echoLevel: 0,
  mrVolumePercent: 100,
  micVolumePercent: 100,
  monitorVoicePercent: 30,
};

/** AudioContext.setSinkId는 표준화 진행 중이라 lib.dom에 없을 수 있어 선택 멤버로 좁힌다 */
interface SinkSelectableContext extends AudioContext {
  setSinkId?: (sinkId: string) => Promise<void>;
}

function volumePercentToDb(percent: number): number {
  if (percent <= 0) return SILENCE_DB;

  return Math.max(SILENCE_DB, 20 * Math.log10(percent / 100));
}

/** 송출 목소리 게인 = 사용자 설정 + 고정 메이크업. 0%(무음)에는 보정을 얹지 않는다 */
function broadcastVoiceDb(percent: number): number {
  if (percent <= 0) return SILENCE_DB;

  return volumePercentToDb(percent) + BROADCAST_VOICE_MAKEUP_DB;
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
    monitorVoicePercent: asFiniteNumber(values.monitorVoicePercent, fallback.monitorVoicePercent),
  };
}

class ToneVocalAudioEngine implements VocalAudioEngine {
  private readonly context: SinkSelectableContext;
  /** 노드 생성 시점의 전역 컨텍스트. 이후 다른 엔진이 전역을 바꿔도 이 엔진의 Tone 노드는 여기 묶인다 */

  private readonly monitorBus: Tone.Volume;
  private readonly broadcastBus: Tone.Volume;
  private readonly broadcastDestination: MediaStreamAudioDestinationNode;
  private readonly soundTouchNode: SoundTouchNode;
  private readonly pitchShift: Tone.PitchShift;
  private readonly mrGain: Tone.Volume;
  /** 목소리 울림(`echoLevel`). 딜레이는 되풀이로 들려 리버브 노드로 구현한다 */
  private readonly voiceEcho: Tone.Reverb;
  /** 송출 전용 목소리 컴프레서. AGC 없이 캡처한 목소리의 큰 편차만 눌러 준다 */
  private readonly voiceCompressor: Tone.Compressor;
  private readonly micGain: Tone.Volume;
  /** 송출 믹스에서만 MR을 덜어내는 트림. 모니터로 가는 mrGain은 건드리지 않는다 */
  private readonly mrBroadcastTrim: Tone.Volume;
  /** 송출 믹스 마지막 단. 목소리 메이크업으로 커진 합산 피크를 잡는다 */
  private readonly broadcastLimiter: Tone.Limiter;
  /** 모니터 전용 목소리 경로 (원음 → 싱크 딜레이 → 울림 → 게인). NS가 도입돼도 이 경로는 거치지 않는다 */
  private readonly monitorVoiceDelay: DelayNode;
  private readonly monitorVoiceEcho: Tone.Reverb;
  private readonly monitorVoiceGain: Tone.Volume;
  /** 송출 MR 싱크 보정 — 가창자가 들은 MR에 맞춰 부른 목소리가 믹스에서 정렬되도록 MR을 늦춘다 */
  private readonly broadcastMrDelay: DelayNode;
  /** 채점용 드라이 탭. 마이크 노드와 달리 엔진 수명 내내 살아 있다 */
  private readonly vocalTap: MediaStreamAudioDestinationNode;
  private readonly vocalAnalyser: AnalyserNode;

  private mrBuffer: AudioBuffer | null = null;
  private mrSource: AudioBufferSourceNode | null = null;
  private mrUrl: string | null = null;
  /** 송출·채점 목소리의 노이즈 제거. 로드 실패 시 null — NS 없이 동작한다 */
  private readonly rnnoise: RnnoiseWorkletNode | null;

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  /** openMic 경합 방지 — 가장 마지막 요청만 살아남는다 */
  private micRequestId = 0;

  /*
   * MR 시간축 추적: BufferSource는 재생 위치 API가 없어 직접 잰다.
   * 배속이 바뀌면 그 시점까지의 진행을 확정하고 앵커를 다시 잡는다.
   */
  private mrAnchorSeconds = 0;
  private mrAnchorContextTime = 0;
  private mrPlaying = false;
  /** 100%가 아닐 때 MR이 SoundTouch stretch 경로를 타는지 */
  private mrStretchActive = false;

  private lastDsp: VocalDspValues = DEFAULT_DSP;
  private onMrEnded: (() => void) | null = null;
  private disposed = false;
  private readonly resumeOnPointerDown = () => {
    void this.context.resume();
  };

  constructor(context: SinkSelectableContext, rnnoise: RnnoiseWorkletNode | null, soundTouchNode: SoundTouchNode) {
    this.context = context;
    this.rnnoise = rnnoise;
    this.soundTouchNode = soundTouchNode;

    this.monitorBus = new Tone.Volume(0).toDestination();
    this.broadcastBus = new Tone.Volume(0);
    this.broadcastDestination = context.createMediaStreamDestination();
    this.broadcastLimiter = new Tone.Limiter(BROADCAST_LIMITER_THRESHOLD_DB);
    this.broadcastBus.connect(this.broadcastLimiter);
    this.broadcastLimiter.connect(this.broadcastDestination);
    // 음성용 적응 처리(VAD·잡음 억제 성향)를 피하고 반주 포함 믹스를 음악으로 인코딩하게 한다
    const [broadcastTrack] = this.broadcastDestination.stream.getAudioTracks();
    if (broadcastTrack !== undefined) {
      broadcastTrack.contentHint = 'music';
    }

    // MR 경로 — 모니터는 즉시, 송출은 보정 딜레이를 거친다 (목소리의 왕복 지연만큼 MR을 늦춤)
    this.mrGain = new Tone.Volume(volumePercentToDb(DEFAULT_DSP.mrVolumePercent));
    this.mrGain.connect(this.monitorBus);
    this.broadcastMrDelay = context.createDelay(BROADCAST_MR_SYNC_MAX_DELAY_SECONDS);
    this.mrBroadcastTrim = new Tone.Volume(BROADCAST_MR_TRIM_DB);
    Tone.connect(this.mrGain, this.broadcastMrDelay);
    Tone.connect(this.broadcastMrDelay, this.mrBroadcastTrim);
    Tone.connect(this.mrBroadcastTrim, this.broadcastBus);
    this.pitchShift = new Tone.PitchShift({
      pitch: 0,
      windowSize: PITCH_SHIFT_WINDOW_SIZE,
      delayTime: 0,
      feedback: 0,
    });
    this.pitchShift.connect(this.mrGain);
    this.pitchShift.wet.value = 0;
    Tone.connect(this.soundTouchNode, this.pitchShift);

    // 목소리 송출 경로 — 모니터로는 가지 않는다 (모니터는 아래 전용 경로)
    this.micGain = new Tone.Volume(broadcastVoiceDb(DEFAULT_DSP.micVolumePercent));
    this.micGain.connect(this.broadcastBus);
    this.voiceCompressor = new Tone.Compressor(BROADCAST_VOICE_COMPRESSOR);
    this.voiceCompressor.connect(this.micGain);
    this.voiceEcho = new Tone.Reverb({
      decay: ECHO_DECAY_SECONDS,
      preDelay: ECHO_PRE_DELAY_SECONDS,
      wet: 0,
    });
    this.voiceEcho.connect(this.voiceCompressor);

    // 목소리 모니터 경로 — SoundTouch stretch 시 MR 지연만큼 목소리를 늦춰 가창 싱크를 맞춘다.
    this.monitorVoiceDelay = context.createDelay(SOUNDTOUCH_MR_LATENCY_SECONDS + 0.05);
    this.monitorVoiceDelay.delayTime.setValueAtTime(0, context.currentTime);
    this.monitorVoiceEcho = new Tone.Reverb({
      decay: ECHO_DECAY_SECONDS,
      preDelay: ECHO_PRE_DELAY_SECONDS,
      wet: 0,
    });
    this.monitorVoiceGain = new Tone.Volume(volumePercentToDb(DEFAULT_DSP.monitorVoicePercent));
    this.monitorVoiceEcho.connect(this.monitorVoiceGain);
    this.monitorVoiceGain.connect(this.monitorBus);

    // 채점 탭. 여기에는 아무것도 연결하지 않아 소리로 나가지 않는다 (분석·녹음 전용).
    this.vocalTap = context.createMediaStreamDestination();
    this.vocalAnalyser = context.createAnalyser();
    this.vocalAnalyser.fftSize = VOCAL_ANALYSER_FFT_SIZE;

    // 자동재생 정책으로 suspended면 다음 클릭에서 살린다
    if (context.state !== 'running') {
      document.addEventListener('pointerdown', this.resumeOnPointerDown, { once: true });
    }
  }

  /**
   * 리버브 임펄스 응답 생성을 기다린다. 생성 전에는 컨볼버에 버퍼가 없어 wet 경로가
   * 소리를 내지 않으므로, 엔진을 넘기기 전에 한 번 끝내 둔다.
   */
  async prepareEcho(): Promise<void> {
    // Tone.Reverb는 임펄스 응답을 오프라인으로 구워야 소리가 난다.
    await Promise.all([this.voiceEcho.generate(), this.monitorVoiceEcho.generate()]);
  }

  async loadMr(url: string): Promise<void> {
    if (this.mrUrl === url && this.mrBuffer !== null) return;

    this.stopMr();
    this.mrBuffer = null;
    this.mrUrl = null;
    this.mrAnchorSeconds = 0;
    this.mrPlaying = false;

    const buffer = await decodeMrBuffer(this.context, url);
    if (this.disposed) return;

    this.mrBuffer = buffer;
    this.mrUrl = url;
    this.applyDsp(this.lastDsp);
  }

  startMr(offsetSeconds?: number): void {
    if (this.disposed || this.mrBuffer === null || this.mrPlaying) return;

    this.disposeMrSource();
    this.mrStretchActive = shouldUseSoundTouchStretch(this.lastDsp.tempoPercent);

    const duration = this.mrBuffer.duration;
    const offset =
      offsetSeconds !== undefined && offsetSeconds > 0
        ? Math.min(offsetSeconds, duration)
        : 0;

    this.beginMrPlayback(offset);
  }

  private beginMrPlayback(offsetSeconds: number): void {
    if (this.disposed || this.mrBuffer === null) return;

    const source = this.context.createBufferSource();
    source.buffer = this.mrBuffer;
    this.attachMrSource(source, this.lastDsp.tempoPercent);
    this.applyMrKey(this.lastDsp.keyOffset);

    const duration = this.mrBuffer.duration;

    source.onended = () => {
      if (this.disposed || !this.mrPlaying || this.mrSource !== source) return;
      this.mrAnchorSeconds = duration;
      this.mrPlaying = false;
      this.mrSource = null;
      this.onMrEnded?.();
    };

    source.start(0, offsetSeconds);
    this.mrSource = source;
    this.mrAnchorSeconds = offsetSeconds;
    this.mrAnchorContextTime = this.context.currentTime;
    this.mrPlaying = true;
    this.updateSyncDelays(this.lastDsp.tempoPercent);
  }

  private attachMrSource(source: AudioBufferSourceNode, tempoPercent: number): void {
    const stretch = shouldUseSoundTouchStretch(tempoPercent);
    this.mrStretchActive = stretch;

    if (stretch) {
      source.connect(this.soundTouchNode);
      applySoundTouchTempoParams(source, this.soundTouchNode, tempoPercent);
      return;
    }

    source.playbackRate.value = 1;
    Tone.connect(source, this.pitchShift);
  }

  private applyMrKey(keyOffset: number): void {
    if (Math.abs(keyOffset) < PITCH_BYPASS_EPSILON) {
      this.pitchShift.wet.value = 0;
      return;
    }

    this.pitchShift.pitch = keyOffset;
    this.pitchShift.wet.value = 1;
  }

  private applyMrTempoRouting(tempoPercent: number): void {
    const stretch = shouldUseSoundTouchStretch(tempoPercent);

    if (stretch === this.mrStretchActive) {
      if (stretch) {
        applySoundTouchTempoParams(this.mrSource, this.soundTouchNode, tempoPercent);
      }
      return;
    }

    if (this.mrPlaying && this.mrSource !== null) {
      const resumeAt = this.mrPositionSeconds();
      this.mrPlaying = false;
      this.disposeMrSource();
      this.mrStretchActive = stretch;
      this.beginMrPlayback(resumeAt);
      return;
    }

    this.mrStretchActive = stretch;
  }

  private updateSyncDelays(tempoPercent: number): void {
    const stretch = shouldUseSoundTouchStretch(tempoPercent);
    const syncDelaySeconds = Math.max(
      0,
      Math.min(
        BROADCAST_MR_SYNC_MAX_DELAY_SECONDS,
        this.context.baseLatency +
          (this.context.outputLatency || 0) +
          MIC_INPUT_LATENCY_ESTIMATE_SECONDS +
          (this.rnnoise !== null ? RNNOISE_LATENCY_SECONDS : 0) -
          (stretch ? SOUNDTOUCH_MR_LATENCY_SECONDS : 0),
      ),
    );
    this.broadcastMrDelay.delayTime.setValueAtTime(syncDelaySeconds, this.context.currentTime);
    this.monitorVoiceDelay.delayTime.setValueAtTime(
      stretch ? SOUNDTOUCH_MR_LATENCY_SECONDS : 0,
      this.context.currentTime,
    );
  }

  stopMr(): void {
    if (!this.mrPlaying || this.mrSource === null) return;

    this.mrAnchorSeconds = this.mrPositionSeconds();
    this.mrPlaying = false;
    try {
      this.mrSource.stop();
    } catch {
      // already stopped
    }
    this.disposeMrSource();
  }

  setOnMrEnded(callback: (() => void) | null): void {
    this.onMrEnded = callback;
  }

  /** 앵커 이후 흐른 컨텍스트 시간에 배속을 곱해 MR 시간축 위치를 낸다 */
  private mrPlaybackRate(): number {
    if (!shouldUseSoundTouchStretch(this.lastDsp.tempoPercent)) {
      return 1;
    }

    return Math.max(0.01, this.lastDsp.tempoPercent / 100);
  }

  private disposeMrSource(): void {
    if (this.mrSource === null) return;

    this.mrSource.onended = null;
    this.mrSource.disconnect();
    this.mrSource = null;
  }

  private mrPositionSeconds(): number {
    if (!this.mrPlaying || this.mrBuffer === null) return this.mrAnchorSeconds;

    const elapsed = this.context.currentTime - this.mrAnchorContextTime;
    const position = this.mrAnchorSeconds + elapsed * this.mrPlaybackRate();

    return Math.min(position, this.mrBuffer.duration);
  }

  getMrPositionMs(): number {
    return this.mrPositionSeconds() * 1000;
  }

  getAppliedKeyOffset(): number {
    return this.lastDsp.keyOffset;
  }

  /**
   * 분석기에 지금 도착한 목소리가 실제로 대응하는 MR 위치까지의 거리(ms, MR 시간축).
   * 채점 타임스탬프에서 이 값을 뺀다.
   */
  getVoiceLatencyInMrMs(): number {
    const wallSeconds =
      this.context.baseLatency +
      (this.context.outputLatency || 0) +
      MIC_INPUT_LATENCY_ESTIMATE_SECONDS +
      (this.rnnoise !== null ? RNNOISE_LATENCY_SECONDS : 0) +
      // 템포 변경 시 가창자가 듣는 MR은 SoundTouch 지연만큼 더 뒤처져 있다.
      // updateSyncDelays()의 빼기와 부호가 반대인 게 맞다 — 송출은 믹스 안 정렬,
      // 여기는 "이 목소리가 어느 MR 지점에 대응하는가"라서 문제가 다르다.
      (shouldUseSoundTouchStretch(this.lastDsp.tempoPercent) ? SOUNDTOUCH_MR_LATENCY_SECONDS : 0) +
      // AnalyserNode는 최근 fftSize 샘플을 주므로 검출 음정은 창 중심에 대응한다
      VOCAL_ANALYSER_FFT_SIZE / 2 / this.context.sampleRate;

    // 벽시계 지연을 MR 시간축으로 환산 — 150% 배속이면 100ms가 MR 150ms에 해당한다
    return wallSeconds * 1000 * this.mrPlaybackRate();
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
    // 송출·채점은 노이즈 제거를 거치고(소음 감소 + 분석 입력 정화), 모니터는 원음 직결이라
    // 워클릿 지연(10ms)이 가창 경험에 붙지 않는다. NS 로드 실패 시엔 원음으로 우회한다.
    const broadcastVoiceSource: AudioNode = this.rnnoise ?? this.micSource;
    if (this.rnnoise !== null) {
      this.micSource.connect(this.rnnoise);
    }
    Tone.connect(broadcastVoiceSource, this.voiceEcho);
    this.micSource.connect(this.monitorVoiceDelay);
    Tone.connect(this.monitorVoiceDelay, this.monitorVoiceEcho);
    // 채점 탭은 에코 앞에서 갈라진다 — 사용자가 건 이펙트가 STT·음정 분석에 섞이지 않는다.
    broadcastVoiceSource.connect(this.vocalAnalyser);
    broadcastVoiceSource.connect(this.vocalTap);
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
    // 정리와 설정 반영이 같은 렌더에 겹치면 파기된 노드의 램프 호출로 죽을 수 있다
    if (this.disposed) {
      this.lastDsp = safe;
      return;
    }

    // 재앵커는 lastDsp 갱신보다 먼저다 — mrPlaybackRate()·mrPositionSeconds()가 옛 배속으로
    // 지금까지의 진행을 확정해야 한다. 갱신 뒤에 비교하면 새 배속끼리라 절대 발동하지 않고,
    // 옛 배속 구간에 새 배속이 소급 적용돼 가사·채점 위치가 점프한다.
    const speedMultiplier = safe.tempoPercent / 100;
    if (this.mrPlaying && this.mrPlaybackRate() !== speedMultiplier) {
      this.mrAnchorSeconds = this.mrPositionSeconds();
      this.mrAnchorContextTime = this.context.currentTime;
    }
    this.lastDsp = safe;
    this.applyMrTempoRouting(safe.tempoPercent);
    this.updateSyncDelays(safe.tempoPercent);

    if (Math.abs(safe.keyOffset) < PITCH_BYPASS_EPSILON) {
      this.pitchShift.wet.rampTo(0, PARAM_RAMP_SECONDS);
    } else {
      this.pitchShift.pitch = safe.keyOffset;
      this.pitchShift.wet.rampTo(1, PARAM_RAMP_SECONDS);
    }

    // decay는 임펄스 응답에 구워져 런타임에 못 바꾸므로 wet만 움직인다.
    // 음수 레벨이 들어오면 sqrt가 NaN이 되어 rampTo가 터지므로 0~1로 먼저 가둔다.
    const echoRatio = Math.min(1, Math.max(0, safe.echoLevel / 100));
    const echoWet = ECHO_WET_MAX * Math.sqrt(echoRatio);
    this.voiceEcho.wet.rampTo(echoWet, PARAM_RAMP_SECONDS);
    // 가창자 본인도 같은 울림을 듣도록 모니터 리버브를 함께 움직인다
    this.monitorVoiceEcho.wet.rampTo(echoWet, PARAM_RAMP_SECONDS);

    this.mrGain.volume.rampTo(volumePercentToDb(safe.mrVolumePercent), PARAM_RAMP_SECONDS);
    this.micGain.volume.rampTo(broadcastVoiceDb(safe.micVolumePercent), PARAM_RAMP_SECONDS);
    this.monitorVoiceGain.volume.rampTo(
      volumePercentToDb(safe.monitorVoicePercent),
      PARAM_RAMP_SECONDS,
    );
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
    this.rnnoise?.disconnect();
    this.rnnoise?.destroy();
    this.stopMr();
    this.mrBuffer = null;
    this.soundTouchNode.disconnect();
    this.pitchShift.dispose();
    this.mrGain.dispose();
    this.broadcastMrDelay.disconnect();
    this.monitorVoiceDelay.disconnect();
    this.mrBroadcastTrim.dispose();
    this.voiceEcho.dispose();
    this.voiceCompressor.dispose();
    this.micGain.dispose();
    this.broadcastLimiter.dispose();
    this.monitorVoiceEcho.dispose();
    this.monitorVoiceGain.dispose();
    this.monitorBus.dispose();
    this.broadcastBus.dispose();
    this.broadcastDestination.disconnect();
    this.vocalAnalyser.disconnect();
    this.vocalTap.disconnect();
    void this.context.close();
  }
}

async function loadRnnoiseNode(context: AudioContext): Promise<RnnoiseWorkletNode | null> {
  try {
    const { loadRnnoise, RnnoiseWorkletNode: WorkletNode } = await import(
      '@sapphi-red/web-noise-suppressor'
    );
    const [wasmBinary] = await Promise.all([
      loadRnnoise({ url: RNNOISE_WASM_URL, simdUrl: RNNOISE_WASM_SIMD_URL }),
      context.audioWorklet.addModule(RNNOISE_WORKLET_URL),
    ]);

    return new WorkletNode(context, { wasmBinary, maxChannels: 1 });
  } catch {
    // 에셋 미생성(404) 등 — 노이즈 제거 없이 공연은 계속돼야 한다
    return null;
  }
}

export async function createVocalAudioEngine(): Promise<VocalAudioEngine> {
  const context = new AudioContext({
    sampleRate: AUDIO_CONTEXT_SAMPLE_RATE,
    latencyHint: 'interactive',
  });
  const rnnoise = await loadRnnoiseNode(context);
  await registerSoundTouchWorklet(context);
  const soundTouchNode = await createSoundTouchMrNode(context);
  // setContext와 노드 생성 사이에 await를 두지 않는다 — 엔진이 겹쳐 만들어져도
  // (React StrictMode 이중 마운트) 노드가 다른 컨텍스트에 섞이지 않는다.
  Tone.setContext(context);
  const engine = new ToneVocalAudioEngine(context, rnnoise, soundTouchNode);

  // 임펄스 응답이 없으면 울림만 조용히 빠진다 — 실패해도 공연은 계속돼야 한다
  await engine.prepareEcho().catch(() => undefined);

  // 방 진입까지의 클릭으로 사용자 활성화가 있으면 즉시 살아난다
  await context.resume().catch(() => undefined);

  return engine;
}
