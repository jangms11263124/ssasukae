export { fetchLyricsCandidates, fetchPlainLyrics } from './api/lyricsApi';
export type { LyricsLookupParams } from './api/lyricsApi';
export {
  DURATION_TOLERANCE_SEC,
  LRCLIB_BASE_URL,
  LRCLIB_CLIENT,
  LYRICS_CACHE_SECONDS,
  LYRICS_LEAD_MS,
  LYRICS_SYNC_OFFSET_MS,
  MAX_CANDIDATES,
  SEARCH_DELAY_MS,
} from './config/lyricsSyncConfig';
export { findLineIndexAt, findNextTextIndex, parseLrc } from './lib/parseLrc';
export { lyricsOverlapRatio, selectLyrics } from './lib/verifyLyrics';
export type {
  LyricsCandidate,
  LyricsLine,
  LyricsLookupResponse,
  LyricsMissReason,
  ResolvedLyrics,
} from './model/types';
