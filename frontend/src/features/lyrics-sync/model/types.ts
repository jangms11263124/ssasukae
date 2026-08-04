/** LRC 한 줄. 간주 구간을 표시하는 빈 text도 그대로 보존한다 */
export interface LyricsLine {
  /** 원곡 시간축 기준 시작 시각(ms) */
  timeMs: number;
  text: string;
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
export type LyricsMissReason = 'NOT_FOUND' | 'NO_SYNCED_LYRICS' | 'RATE_LIMITED';

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
