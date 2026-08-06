import { SingerPitchCollector } from './SingerPitchCollector';
import { SingerSttRecorder } from './SingerSttRecorder';
import type { ScoringSessionResult } from './types';

interface ScoringSessionOptions {
  /** 오디오 엔진의 드라이 목소리 탭 (MediaRecorder 입력) */
  captureStream: MediaStream;
  /** 같은 목소리를 보는 분석 노드 (음정 추출 입력) */
  analyser: AnalyserNode;
  /** MR 재생 위치(ms). STT 구간 경계와 음정 프레임이 같은 시간축을 쓴다 */
  getTimeMs: () => number;
  /** 지금 MR에 적용된 키 오프셋(반음). 가창 음정을 원곡 키 기준으로 되돌리는 데 쓴다 */
  getKeyOffset: () => number;
}

/**
 * 공연 한 번 동안의 채점 입력 수집. STT 녹음과 음정 수집을 같은 수명으로 묶는다.
 * 마이크는 오디오 엔진이 이미 열어 둔 것을 나눠 쓴다 — 여기서 새로 열지 않는다.
 */
export class ScoringSession {
  private readonly recorder: SingerSttRecorder;
  private readonly collector: SingerPitchCollector;
  /** finish()를 여러 번 불러도 같은 결과를 준다 */
  private finished: Promise<ScoringSessionResult> | null = null;

  constructor(options: ScoringSessionOptions) {
    this.recorder = new SingerSttRecorder({
      stream: options.captureStream,
      getTimeMs: options.getTimeMs,
    });
    this.collector = new SingerPitchCollector({
      analyser: options.analyser,
      getTimeMs: options.getTimeMs,
      getKeyOffset: options.getKeyOffset,
    });
  }

  get isSttSupported(): boolean {
    return this.recorder.isSupported;
  }

  start(): void {
    this.recorder.start();
    this.collector.start();
  }

  /** 공연 일시 중지 — MR이 멈춰 시간축이 흐르지 않는 동안에는 수집도 멈춘다 */
  pause(): void {
    this.recorder.pause();
    this.collector.pause();
  }

  resume(): void {
    this.recorder.resume();
    this.collector.resume();
  }

  /** 수집을 닫고 마지막 STT 응답까지 받은 결과를 준다 */
  finish(): Promise<ScoringSessionResult> {
    this.finished ??= (async () => {
      const singerMidi = this.collector.stop();
      const stt = await this.recorder.stop();

      return { stt, singerMidi };
    })();

    return this.finished;
  }
}
