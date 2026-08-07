/** 음절 하나의 표시 텍스트와 발성 구간. midi.json의 syllable_highlights에서 온다 */
export interface SyllableTiming {
  /** 가사 원문 정렬로 붙인 공백·문장부호까지 포함한 표시 텍스트 */
  text: string;
  startMs: number;
  endMs: number;
}

/** 가사 한 줄. 간주 구간을 표시하는 빈 text도 그대로 보존한다 */
export interface LyricsLine {
  /** 원곡 시간축 기준 시작 시각(ms) */
  timeMs: number;
  text: string;
  /** 음절별 하이라이트 타이밍. midi.json에서 온 소절에만 있다 (LRC 소절은 없음) */
  syllables?: SyllableTiming[];
}

/** LRCLIB 레코드에서 우리가 쓰는 필드만 추린 것 */
export interface LyricsCandidate {
  id: number;
  trackName: string;
  artistName: string;
  /** LRCLIB에 등록된 곡 길이(초). 없으면 null */
  duration: number | null;
  instrumental: boolean;
  /** LRC 형식 원문. 타임스탬프가 없는 레코드는 null */
  syncedLyrics: string | null;
}

/** 후보가 비었을 때의 사유. 화면 안내 문구를 고르는 데 쓴다 */
export type LyricsMissReason =
  | 'NOT_FOUND'
  | 'NO_SYNCED_LYRICS'
  /** 싱크 가사는 있었지만 곡 길이가 우리 음원과 맞는 레코드가 없다 */
  | 'DURATION_MISMATCH'
  | 'RATE_LIMITED';

export interface LyricsLookupResponse {
  candidates: LyricsCandidate[];
  reason?: LyricsMissReason;
}

/** 백엔드 가사 원문과 대조를 통과한 최종 결과 */
export interface ResolvedLyrics {
  lines: LyricsLine[];
  /** 어느 LRCLIB 레코드를 썼는지 (문제 신고·디버깅용) */
  recordId: number;
}
