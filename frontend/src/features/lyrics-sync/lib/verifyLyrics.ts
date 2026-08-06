import { MIN_OVERLAP_RATIO } from '../config/lyricsSyncConfig';
import type { LyricsCandidate, LyricsLine, ResolvedLyrics } from '../model/types';
import { parseLrc } from './parseLrc';

/** 대조에 방해되는 공백·문장부호·대소문자 차이를 없앤다 (문자와 숫자만 남긴다) */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** 짧은 조각은 우연히 포함될 수 있어 대조 대상에서 뺀다 */
const MIN_COMPARABLE_LENGTH = 4;

/**
 * LRCLIB 후보의 가사가 백엔드가 준 가사 원문과 같은 곡인지 본문 겹침 비율로 재어 본다.
 * 공백을 지운 원문 한 덩어리에 각 소절이 들어 있는지 보므로, 줄 나눔이나
 * 띄어쓰기가 달라도 같은 곡이면 높은 비율이 나온다.
 */
export function lyricsOverlapRatio(lines: LyricsLine[], plainLyrics: string): number {
  const reference = normalize(plainLyrics);
  if (reference === '') return 0;

  const comparable = lines
    .map((line) => normalize(line.text))
    .filter((text) => text.length >= MIN_COMPARABLE_LENGTH);
  if (comparable.length === 0) return 0;

  const hits = comparable.filter((text) => reference.includes(text)).length;

  return hits / comparable.length;
}

/**
 * 후보들 중 실제로 쓸 가사를 고른다.
 *
 * 백엔드 가사 원문이 있으면 이를 정답지로 삼아 겹침 비율이 가장 높은 후보를 쓰고,
 * 기준에 못 미치면 아무것도 반환하지 않는다 — 동명이곡의 타임스탬프로
 * 엉뚱한 가사를 흘리는 것보다 "가사 없음"이 낫다.
 *
 * 원문을 못 받았으면(가사 파일 다운로드 실패 등) 검증을 건너뛰고 1순위 후보를 쓴다.
 */
export function selectLyrics(
  candidates: LyricsCandidate[],
  plainLyrics: string | null,
): ResolvedLyrics | null {
  const parsed = candidates
    .map((candidate) => ({
      recordId: candidate.id,
      lines: candidate.syncedLyrics === null ? [] : parseLrc(candidate.syncedLyrics),
    }))
    .filter((entry) => entry.lines.some((line) => line.text !== ''));

  if (parsed.length === 0) return null;

  if (plainLyrics === null || normalize(plainLyrics) === '') {
    return parsed[0];
  }

  const scored = parsed
    .map((entry) => ({ ...entry, ratio: lyricsOverlapRatio(entry.lines, plainLyrics) }))
    .sort((left, right) => right.ratio - left.ratio);

  const best = scored[0];

  return best.ratio >= MIN_OVERLAP_RATIO ? { recordId: best.recordId, lines: best.lines } : null;
}
