export type ScoreGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export const NO_SCORE_LABEL = 'N/A';

/**
 * 주의: 이 구간은 프론트 단독 계약이 아니다 — AI 피드백 목록의 등급 필터는 등급 문자를
 * 그대로 백엔드에 보내고, 백엔드 FeedbackService.getScoreCriteria가 자체 구간으로
 * 점수를 거른다. 여기를 바꾸면 백엔드 구간도 함께 바꿔야 배지와 필터 결과가 어긋나지 않는다.
 */
export function getScoreGrade(score: number): ScoreGrade {
  if (score >= 95) return 'S';
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

export const GRADE_CLASS: Record<ScoreGrade, string> = {
  S: 'border-cyan-300/70 text-cyan-300',
  A: 'border-fuchsia-400/60 text-fuchsia-300',
  B: 'border-amber-300/60 text-amber-300',
  C: 'border-zinc-300/50 text-zinc-300',
  D: 'border-[#9C6B30]/50 text-[#9C6B30]',
  F: 'border-white/[0.07] text-zinc-500',
};
