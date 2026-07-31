export type ScoreGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export const NO_SCORE_LABEL = 'N/A';

export function getScoreGrade(score: number): ScoreGrade {
  if (score >= 95) return 'S';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score > 40) return 'D';
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