/**
 * AI 피드백 목록과 상세가 같은 TRACK_ 순번 표기를 쓰기 위한 단일 소스.
 * 목록이 링크 쿼리에 순번을 실어 보내고, 상세는 같은 포맷으로 그대로 보여준다.
 */
export const TRACK_QUERY_PARAM = 'track';

/** 순번을 모르면(주소 직접 진입) 자리 표시로 대체한다 — DB ID를 순번처럼 보여주지 않는다 */
export function formatTrackLabel(trackNo: number | undefined): string {
  return `TRACK_${trackNo !== undefined ? String(trackNo).padStart(2, '0') : '--'}`;
}

export function buildFeedbackDetailPath(feedbackId: number, trackNo: number): string {
  return `/ai-feedback/${feedbackId}?${TRACK_QUERY_PARAM}=${trackNo}`;
}
