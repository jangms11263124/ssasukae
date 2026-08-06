import { PitchDetector } from 'pitchy';

import {
  PITCH_CLARITY_THRESHOLD,
  PITCH_MAX_MIDI,
  PITCH_MIN_MIDI,
  PITCH_MIN_VOLUME_DECIBELS,
  PITCH_SAMPLE_INTERVAL_MS,
} from '../config/scoringConfig';
import type { SingerMidiJson, SingerMidiNote } from './types';

interface SingerPitchCollectorOptions {
  /** 오디오 엔진의 드라이 목소리 분석 노드 */
  analyser: AnalyserNode;
  /** 프레임 시각(ms). MR 재생 위치를 넘긴다 — 정답 MIDI와 같은 시간축이어야 한다 */
  getTimeMs: () => number;
  /** 지금 MR에 적용된 키 오프셋(반음). 정답 MIDI는 원곡 키라 이만큼 빼서 축을 맞춘다 */
  getKeyOffset: () => number;
}

/** A4(440Hz) = MIDI 69 기준 반음 환산 */
function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

/**
 * 가창 음정을 50ms 간격으로 뽑아 프레임 단위 note로 쌓는다.
 *
 * 인접 프레임을 하나의 긴 note로 묶지 않는다. AI 채점의 안정성 점수가 "정답 note 구간에
 * 겹친 가창 note들의 음높이 표준편차"라, 묶어 버리면 구간마다 note가 하나뿐이라 표준편차가
 * 늘 0이 되어 안정성이 항상 만점으로 나온다.
 *
 * 소리를 내지 않은 프레임은 note를 만들지 않는다 — 정답 구간의 커버리지가 떨어져
 * 부르지 않은 부분이 점수에 그대로 반영된다.
 */
export class SingerPitchCollector {
  private readonly analyser: AnalyserNode;
  private readonly getTimeMs: () => number;
  private readonly getKeyOffset: () => number;
  private readonly detector: PitchDetector<Float32Array>;
  private readonly buffer: Float32Array<ArrayBuffer>;
  private readonly notes: SingerMidiNote[] = [];

  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(options: SingerPitchCollectorOptions) {
    this.analyser = options.analyser;
    this.getTimeMs = options.getTimeMs;
    this.getKeyOffset = options.getKeyOffset;

    const size = this.analyser.fftSize;
    this.buffer = new Float32Array(size);
    this.detector = PitchDetector.forFloat32Array(size);
    this.detector.clarityThreshold = PITCH_CLARITY_THRESHOLD;
    this.detector.minVolumeDecibels = PITCH_MIN_VOLUME_DECIBELS;
  }

  start(): void {
    this.resume();
  }

  pause(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  resume(): void {
    if (this.stopped || this.timer !== null) return;
    this.timer = setInterval(() => this.sample(), PITCH_SAMPLE_INTERVAL_MS);
  }

  stop(): SingerMidiJson {
    this.pause();
    this.stopped = true;

    return { notes: this.notes };
  }

  private sample(): void {
    this.analyser.getFloatTimeDomainData(this.buffer);

    const [hz, clarity] = this.detector.findPitch(this.buffer, this.analyser.context.sampleRate);
    if (clarity < PITCH_CLARITY_THRESHOLD || hz <= 0) return;

    const midi = hzToMidi(hz);
    // 배음·잡음이 만든 극단값은 중앙값·표준편차를 크게 흔든다.
    if (midi < PITCH_MIN_MIDI || midi > PITCH_MAX_MIDI) return;

    // 가창자는 키가 바뀐 MR을 따라 부르지만 정답 MIDI는 원곡 키다. 전송 직전 일괄 보정이
    // 아니라 프레임마다 빼야 한다 — 수성전 카드로 키가 곡 중간에 바뀌었다 돌아오기 때문이다.
    const midiInOriginalKey = midi - this.getKeyOffset();

    const startMs = Math.round(this.getTimeMs());
    const previous = this.notes.at(-1);
    // 일시 중지 등으로 MR 시간이 멈춰 있으면 길이 0인 note가 생겨 AI가 400으로 거절한다.
    if (previous !== undefined && startMs < previous.end_ms) return;

    this.notes.push({
      start_ms: startMs,
      end_ms: startMs + PITCH_SAMPLE_INTERVAL_MS,
      // 소수점을 유지한다 — 반올림하면 안정성 점수의 표준편차가 계단처럼 튄다.
      midi: Number(midiInOriginalKey.toFixed(3)),
    });
  }
}
