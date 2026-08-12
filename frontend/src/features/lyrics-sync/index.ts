export { fetchLyricsCandidates, fetchMidiJson, fetchPlainLyrics } from './api/lyricsApi';
export type { LyricsLookupParams } from './api/lyricsApi';
export {
  DURATION_TOLERANCE_SEC,
  LISTENER_AUDIO_BASE_DELAY_MS,
  LISTENER_LYRICS_DELAY_MS,
  LRCLIB_BASE_URL,
  LRCLIB_CLIENT,
  LYRICS_CACHE_SECONDS,
  LYRICS_COUNTDOWN_LEAD_MS,
  LYRICS_COUNTDOWN_MIN_GAP_MS,
  LYRICS_LEAD_MS,
  LYRICS_SYNC_OFFSET_MS,
  MAX_CANDIDATES,
  SEARCH_DELAY_MS,
  SONG_DURATION_WAIT_MS,
  SYLLABLE_LINE_CLEAR_GAP_MS,
  SYLLABLE_TICK_INTERVAL_MS,
} from './config/lyricsSyncConfig';
export { findLineIndexAt, findNextTextIndex, parseLrc } from './lib/parseLrc';
export { parseSyllableHighlights } from './lib/parseSyllableHighlights';
export { lyricsOverlapRatio, selectLyrics } from './lib/verifyLyrics';
export type {
  LyricsCandidate,
  LyricsLine,
  LyricsLookupResponse,
  LyricsMissReason,
  ResolvedLyrics,
  SyllableTiming,
} from './model/types';
