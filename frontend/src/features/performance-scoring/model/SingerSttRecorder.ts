import { requestStt } from '../api/sttApi';
import {
  STT_CHUNK_DURATION_MS,
  STT_MIME_CANDIDATES,
  STT_MIN_CHUNK_BYTES,
} from '../config/scoringConfig';
import type { SingerSttResult, SttChunkResult } from './types';

interface SingerSttRecorderOptions {
  /** 녹음할 드라이 목소리 스트림. 오디오 엔진의 채점 탭을 넘긴다 */
  stream: MediaStream;
  /** 구간 경계에 기록할 시각(ms). MR 재생 위치를 넘긴다 */
  getTimeMs: () => number;
}

type SttFormat = (typeof STT_MIME_CANDIDATES)[number];

interface PendingChunk {
  index: number;
  startMs: number;
  endMs: number;
  blob: Blob;
}

function resolveFormat(): SttFormat | null {
  return (
    STT_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType)) ??
    null
  );
}

/**
 * 가창 음성을 30초 단위로 잘라 STT에 순서대로 올린다.
 *
 * timeslice로 조각을 받지 않고 30초마다 MediaRecorder를 새로 만든다 — timeslice 조각은
 * 첫 조각에만 컨테이너 헤더가 붙어 두 번째부터는 독립된 파일로 디코드되지 않는다.
 *
 * 업로드는 큐에 쌓아 하나씩 처리한다. STT 응답이 30초를 넘겨도 다음 구간 녹음은 계속되고,
 * transcript 순서도 응답 도착 순서에 흔들리지 않는다.
 */
export class SingerSttRecorder {
  private readonly stream: MediaStream;
  private readonly getTimeMs: () => number;
  private readonly format = resolveFormat();
  private readonly results: SttChunkResult[] = [];

  private recorder: MediaRecorder | null = null;
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  /** 진행 중인 구간이 업로드 큐에 올라가면 풀린다 */
  private currentChunkClosed: Promise<void> = Promise.resolve();
  private nextIndex = 0;
  /** 업로드 직렬화 — 앞 구간이 끝나야 다음 구간이 나간다 */
  private uploadQueue: Promise<void> = Promise.resolve();
  private started = false;
  private paused = false;
  private stopped = false;

  constructor(options: SingerSttRecorderOptions) {
    this.stream = options.stream;
    this.getTimeMs = options.getTimeMs;
  }

  /** MediaRecorder가 이 브라우저에서 쓸 수 있는 컨테이너를 찾지 못하면 false */
  get isSupported(): boolean {
    return this.format !== null;
  }

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.startChunk();
  }

  /** 공연 일시 중지 — 진행 중이던 구간은 그대로 올리고 새 구간을 열지 않는다 */
  pause(): void {
    if (this.paused || this.stopped) return;
    this.paused = true;
    void this.closeCurrentChunk();
  }

  resume(): void {
    if (!this.paused || this.stopped) return;
    this.paused = false;
    this.startChunk();
  }

  /** 마지막 구간까지 응답을 받은 결과를 준다. 여러 번 불러도 안전하다 */
  async stop(): Promise<SingerSttResult> {
    if (!this.stopped) {
      this.stopped = true;
      await this.closeCurrentChunk();
    }

    // 큐에 남은 업로드가 모두 끝나야 결과가 완성된다.
    await this.uploadQueue;

    return this.buildResult();
  }

  private startChunk(): void {
    const format = this.format;
    if (this.stopped || this.paused || format === null) return;

    const recorder = new MediaRecorder(this.stream, { mimeType: format.mimeType });
    const parts: Blob[] = [];
    const index = this.nextIndex++;
    const startMs = this.getTimeMs();

    let markClosed = () => {};
    this.currentChunkClosed = new Promise<void>((resolve) => {
      markClosed = resolve;
    });

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) parts.push(event.data);
    });

    recorder.addEventListener('stop', () => {
      this.enqueueUpload({
        index,
        startMs,
        endMs: this.getTimeMs(),
        blob: new Blob(parts, { type: format.mimeType }),
      });
      // 다음 구간을 열기 전에 풀어야 한다 — startChunk가 currentChunkClosed를 갈아끼운다.
      markClosed();
      // 중지·일시중지 상태면 여기서 조용히 끝난다.
      this.startChunk();
    });

    recorder.start();
    this.recorder = recorder;
    this.rotateTimer = setTimeout(() => recorder.stop(), STT_CHUNK_DURATION_MS);
  }

  /** 진행 중인 구간을 끊고 업로드 큐에 올라갈 때까지 기다린다 */
  private closeCurrentChunk(): Promise<void> {
    if (this.rotateTimer !== null) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
    }

    const recorder = this.recorder;
    this.recorder = null;

    // 회전 타이머가 이미 stop()을 불러 이벤트만 기다리는 중일 수 있다.
    // 그때도 state는 inactive지만 적재는 아직이므로 약속을 그대로 돌려준다.
    if (recorder !== null && recorder.state !== 'inactive') {
      recorder.stop();
    }

    return this.currentChunkClosed;
  }

  private enqueueUpload(chunk: PendingChunk): void {
    this.uploadQueue = this.uploadQueue.then(() => this.upload(chunk));
  }

  private async upload(chunk: PendingChunk): Promise<void> {
    const base = {
      index: chunk.index,
      startMs: Math.round(chunk.startMs),
      endMs: Math.round(chunk.endMs),
      audioBytes: chunk.blob.size,
    };

    if (chunk.blob.size < STT_MIN_CHUNK_BYTES) {
      this.results.push({
        ...base,
        status: 'failed',
        transcript: '',
        error: '녹음 데이터가 너무 작아 전송하지 않았습니다.',
      });
      return;
    }

    const fileName = `singing-${chunk.index}.${this.format?.extension ?? 'webm'}`;

    try {
      this.results.push({
        ...base,
        status: 'success',
        transcript: await requestStt(chunk.blob, fileName),
      });
    } catch (error) {
      // 한 구간이 실패해도 나머지 구간으로 채점은 진행한다.
      this.results.push({
        ...base,
        status: 'failed',
        transcript: '',
        error: error instanceof Error ? error.message : 'STT 요청 실패',
      });
    }
  }

  private buildResult(): SingerSttResult {
    const chunks = [...this.results].sort((a, b) => a.index - b.index);
    const fullTranscript = chunks
      .filter((chunk) => chunk.status === 'success')
      .map((chunk) => chunk.transcript.trim())
      .filter((transcript) => transcript !== '')
      .join(' ');

    return { chunks, fullTranscript };
  }
}
