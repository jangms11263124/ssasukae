import type { ScoreGrade } from '@/shared/lib/scoreGrade';

/** 기간 필터. 백엔드가 "일수 문자열"로 받는다. */
export type FeedbackPeriod = '30' | '7' | '1';

/** 랭크 필터. "All" 외에는 등급 문자 그대로 전달한다. */
export type FeedbackGradeFilter = 'All' | ScoreGrade;

/** 정렬. 백엔드가 이 두 문자열만 허용한다(그 외 400). */
export type FeedbackSort = 'recently' | 'high-score';

export interface FeedbackSummary {
  totalSongs: number;
  avgScore: number;
}

export interface FeedbackItem {
  feedbackId: number;
  songId: number;
  title: string;
  artist: string;
  /** 앨범 썸네일 URL. 백엔드 fix/89 머지 전 응답에는 없을 수 있다. */
  thumbnail?: string | null;
  /** LocalDateTime 문자열. 예: "2026-07-22T14:59:27.965355" */
  singAt: string;
  /** AI 총평. 분석 전이면 null일 수 있다. */
  overall: string | null;
  score: number;
}

export interface FeedbackListPage {
  feedbacks: FeedbackItem[];
  nextCursor: number | null;
  hasNext: boolean;
  /** 필터 조건에 맞는 전체 개수 */
  total: number;
}

/** 지표 점수. 전부 0~100 스케일이며, 분석 전이면 null일 수 있다. */
export interface FeedbackScores {
  pitch: number | null;
  rhythm: number | null;
  lyricsAccuracy: number | null;
  stability: number | null;
  difficulty: number | null;
  total: number | null;
}

export interface FeedbackDetail {
  performanceId: number;
  title: string;
  artist: string;
  /** 앨범 썸네일 URL. 백엔드 fix/89 머지 전 응답에는 없을 수 있다. */
  thumbnail?: string | null;
  scores: FeedbackScores;
  /** AI 총평/강점/약점/개선 팁. 분석 전이면 null일 수 있다. */
  overall: string | null;
  strength: string | null;
  weakness: string | null;
  tip: string | null;
}
