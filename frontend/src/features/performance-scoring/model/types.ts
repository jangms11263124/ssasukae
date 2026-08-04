/** 30초 구간 하나의 STT 결과. 실패한 구간도 남겨 서버가 재시도 여부를 판단할 수 있게 한다 */
export interface SttChunkResult {
  index: number;
  /** MR 시간축 기준 구간 시작(ms) */
  startMs: number;
  endMs: number;
  audioBytes: number;
  status: 'success' | 'failed';
  transcript: string;
  error?: string;
}

export interface SingerSttResult {
  chunks: SttChunkResult[];
  /** 성공한 구간만 index 순으로 이어 붙인 값. 최종 채점의 transcript 필드에 그대로 넣는다 */
  fullTranscript: string;
}

/** AI 최종 채점의 singerMidi 파일 형식 — 스네이크 케이스가 계약이다 */
export interface SingerMidiNote {
  start_ms: number;
  end_ms: number;
  midi: number;
}

export interface SingerMidiJson {
  notes: SingerMidiNote[];
}

export interface ScoringSessionResult {
  stt: SingerSttResult;
  singerMidi: SingerMidiJson;
}
