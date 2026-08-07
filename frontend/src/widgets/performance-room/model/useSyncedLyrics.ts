'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchLyricsCandidates,
  fetchMidiJson,
  fetchPlainLyrics,
  findLineIndexAt,
  findNextTextIndex,
  parseSyllableHighlights,
  selectLyrics,
  LISTENER_LYRICS_DELAY_MS,
  LYRICS_COUNTDOWN_LEAD_MS,
  LYRICS_COUNTDOWN_MIN_GAP_MS,
  LYRICS_LEAD_MS,
  LYRICS_SYNC_OFFSET_MS,
  SONG_DURATION_WAIT_MS,
  type LyricsLine,
  type LyricsMissReason,
  type SyllableTiming,
} from '@/features/lyrics-sync';
import type { VocalAudioEngine } from '@/features/vocal-audio-engine';

import { useCardStore } from './cardStore';
import { resolveEffectiveSettings } from './effectiveSettings';
import { useStageAudioContext } from './StageAudioContext';
import { useStageStore } from './stageStore';

/** 조회 실패 사유. 서버가 준 사유에 클라이언트 쪽 사유를 더한다 */
type MissReason = LyricsMissReason | 'DURATION_UNKNOWN' | 'MISMATCH' | 'ERROR';

type LoadState =
  | { status: 'IDLE' }
  | { status: 'LOADING' }
  | { status: 'READY'; lines: LyricsLine[] }
  | { status: 'UNAVAILABLE'; reason: MissReason };

const MISS_MESSAGES: Record<MissReason, string> = {
  NOT_FOUND: '이 곡의 싱크 가사를 찾지 못했습니다',
  NO_SYNCED_LYRICS: '이 곡은 타임스탬프가 있는 가사가 없습니다',
  DURATION_MISMATCH: '이 곡은 싱크 가사를 지원하지 않습니다',
  RATE_LIMITED: '가사 서버 요청이 많아 가사를 불러오지 못했습니다',
  DURATION_UNKNOWN: '곡 길이를 확인하지 못해 가사를 표시할 수 없습니다',
  MISMATCH: '곡과 일치하는 가사를 찾지 못했습니다',
  ERROR: '가사를 불러오지 못했습니다',
};

const NO_LINES: LyricsLine[] = [];

/** 소절 경계를 확인하는 주기 */
const LINE_TICK_INTERVAL_MS = 100;

export interface SyncedLyricsState {
  /** IDLE이면 오버레이를 그리지 않는다 */
  status: 'IDLE' | 'LOADING' | 'READY' | 'UNAVAILABLE';
  /** 지금 부를 소절. 간주 구간이거나 재생 전이면 빈 문자열 */
  currentLine: string;
  /** 지금 부를 소절의 음절 타이밍. midi.json에 음절 데이터가 없는 곡이면 null */
  currentSyllables: SyllableTiming[] | null;
  /** 다음 소절 미리보기. 재생 전에는 첫 소절이 들어온다 */
  nextLine: string;
  /** LOADING·UNAVAILABLE일 때 보여줄 안내 문구 */
  message: string | null;
  /** 인트로·간주 끝의 3·2·1. 그 밖에는 null */
  countdown: number | null;
  /**
   * 음절 하이라이트가 읽는 재생 시계(ms). 소절 넘김과 달리 선행 표시(LYRICS_LEAD_MS)
   * 없이 실제 발성 시점에 맞춘다. 오버레이 말단이 자체 틱으로 읽는다 — 컨텍스트 값에
   * 음절 인덱스를 넣으면 음절마다 무대 전체가 리렌더되기 때문이다.
   */
  getHighlightTimeMs: () => number;
}

/**
 * 노래방식 3·2·1. 지금 부를 소절이 없고(인트로·간주) 다음 소절이 코앞일 때만 센다.
 *
 * 소절 사이의 짧은 숨 자리마다 숫자가 튀면 방해만 되므로, 공백이 충분히 길 때만 띄운다.
 * 시작 전(index === -1)의 공백은 곡 머리부터 첫 소절까지다.
 */
function resolveCountdown(
  lines: LyricsLine[],
  index: number,
  nextIndex: number,
  timeMs: number,
): number | null {
  if (nextIndex < 0) return null;
  // 부를 소절이 이미 떠 있으면 카운트다운할 자리가 아니다.
  if (index >= 0 && lines[index].text !== '') return null;

  const gapStartMs = index >= 0 ? lines[index].timeMs : 0;
  if (lines[nextIndex].timeMs - gapStartMs < LYRICS_COUNTDOWN_MIN_GAP_MS) return null;

  const remainingMs = lines[nextIndex].timeMs - timeMs;
  if (remainingMs <= 0 || remainingMs > LYRICS_COUNTDOWN_LEAD_MS) return null;

  return Math.ceil(remainingMs / 1_000);
}

/** 카드 효과까지 반영한 실제 배속. MR 시간축이 벽시계보다 이 비율만큼 빨리 흐른다 */
function usePlaybackRate(): number {
  const settings = useStageStore((state) => state.settings);
  const activeEffect = useCardStore((state) => state.activeEffect);

  return resolveEffectiveSettings(settings, activeEffect).tempoPercent / 100;
}

/**
 * 가사 시간축의 현재 위치(ms)를 읽는 함수를 만든다.
 *
 * 가창자는 오디오 엔진의 MR 재생 위치를 그대로 쓴다 — 템포 변경과 재개 오프셋이 이미
 * 반영된 축이라 정답 MIDI·채점과도 같은 기준이 된다.
 *
 * 청자는 엔진이 없다(가창자만 MR을 재생한다). 그래서 재생이 흐른 만큼을 로컬에서 세되,
 * 시작 위치는 서버가 준 값(resumeOffsetMs)을 쓴다 — 공연 중에 입장한 참가자나 재개된
 * 공연에서도 중간부터 맞물린다.
 *
 * 중요한 건 배속이다. MR 시간축은 벽시계가 아니라 재생 배속으로 흐른다(엔진의
 * mrPositionSeconds가 흐른 시간에 playbackRate를 곱한다). 벽시계로 세면 템포 110%짜리
 * 3분 곡에서 끝날 때쯤 18초가 밀린다 — 참가자 화면에서만 가사가 어긋나던 원인이다.
 * 그래서 호출될 때마다 "지난 시간 × 지금 배속"을 더하는 적분식으로 센다. 템포가 바뀌어도
 * 그 시점까지 쌓인 위치는 그대로 두고 이후 속도만 갈린다.
 *
 * 반환 함수는 호출할 때마다 시계를 감으므로, 한 틱에서 한 번만 읽는다.
 */
function useLyricsClock(isPerformer: boolean, engine: VocalAudioEngine | null): () => number {
  const phase = useStageStore((state) => state.phase);
  const isSuspended = useStageStore((state) => state.isSuspended);
  const resumeOffsetMs = useStageStore((state) => state.resumeOffsetMs);
  const rate = usePlaybackRate();

  const isRunning = phase === 'PERFORMING' && !isSuspended;
  const clockRef = useRef<{ positionMs: number; readAt: number } | null>(null);
  const rateRef = useRef(rate);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  // 재생이 시작·재개될 때 기준점을 새로 잡고, 멈춘 동안에는 비워 시간이 흐르지 않게 한다.
  // 공연마다 resumeOffsetMs가 0으로 돌아오므로 기준점도 반드시 함께 갱신되어야 한다.
  useEffect(() => {
    if (isPerformer) return;

    clockRef.current = isRunning
      ? { positionMs: resumeOffsetMs, readAt: performance.now() }
      : null;
  }, [isPerformer, isRunning, resumeOffsetMs]);

  return useCallback(() => {
    if (isPerformer) return engine?.getMrPositionMs() ?? 0;

    const clock = clockRef.current;
    if (clock === null) return resumeOffsetMs;

    const now = performance.now();
    clock.positionMs += (now - clock.readAt) * rateRef.current;
    clock.readAt = now;

    return clock.positionMs;
  }, [isPerformer, engine, resumeOffsetMs]);
}

/**
 * 선곡된 곡의 싱크 가사를 받아, MR 재생 위치에 맞춰 소절을 넘긴다.
 * useStageAudioEngine·useStageScoring과 같은 자리의 도메인 접착 훅이다.
 *
 * 타이밍은 두 곳에서 온다. 1순위는 midi.json의 음절 하이라이트다 — 분석 파이프라인이
 * 우리 MR 음원에서 직접 뽑은 값이라 정확하고, 음절 단위 진행 표시까지 된다.
 * 음절 데이터가 없는 곡만 LRCLIB에서 소절 타임스탬프를 받는다(음절 표시는 없다).
 *
 * LRCLIB 폴백에서는 백엔드 가사 원문을 정답지로 써서 후보가 같은 곡인지 대조하고
 * (동명이곡 오매칭 방지), 곡 길이가 우리 음원과 맞는 후보만 쓴다 (라우트에서 걸러진다).
 * 맞는 후보가 없으면 어긋난 가사를 흘리는 대신 미지원으로 안내한다.
 */
export function useSyncedLyrics(isPerformer: boolean): SyncedLyricsState {
  const phase = useStageStore((state) => state.phase);
  const selectedSong = useStageStore((state) => state.selectedSong);
  const lyricsDownloadUrl = useStageStore((state) => state.lyricsDownloadUrl);
  const midiJsonDownloadUrl = useStageStore((state) => state.midiJsonDownloadUrl);
  const { engine } = useStageAudioContext();

  const songId = selectedSong?.id ?? null;
  const title = selectedSong?.title ?? null;
  const artist = selectedSong?.artist;
  const durationSeconds = selectedSong?.durationSeconds;

  // MR과 같은 타이밍에 미리 받는다. 공연이 시작된 뒤에 받으면 첫 소절을 놓친다.
  const isSongLoaded = (phase === 'READY' || phase === 'PERFORMING') && songId !== null;
  // 길이가 후보 채택의 필수 조건이라, 채워질 때까지 조회를 미룬다.
  const hasDuration = durationSeconds !== undefined && durationSeconds > 0;
  const shouldLoad = isSongLoaded && hasDuration;

  /**
   * 이 조회를 식별하는 키. 결과를 키와 함께 들고 있다가 렌더 때 지금 키와 맞춰 보는 방식으로
   * 곡이 바뀔 때의 초기화를 처리한다 — 효과 안에서 setState로 되돌리면 렌더가 한 번 더 돈다.
   * artist는 스냅샷이 늦게 채우므로, 채워지면 키가 바뀌며 다시 조회된다.
   */
  const requestKey = shouldLoad
    ? `${songId}|${artist ?? ''}|${durationSeconds}|${lyricsDownloadUrl ?? ''}|${midiJsonDownloadUrl ?? ''}`
    : null;

  const [result, setResult] = useState<{ key: string; state: LoadState } | null>(null);
  const [active, setActive] = useState<{
    key: string;
    index: number;
    countdown: number | null;
  } | null>(null);

  /**
   * 곡 길이를 기다리다 한도를 넘긴 곡의 id.
   *
   * 선곡한 가창자는 길이를 바로 알지만 나머지 참가자는 방 스냅샷으로만 알 수 있다. 그 왕복이
   * 끝나기 전에 미지원 안내를 띄우면 곧 가사로 바뀌며 깜빡이므로, 기다리는 동안은 "불러오는
   * 중"으로 두고 스냅샷이 실패해 끝내 오지 않을 때만 알린다.
   * 결과를 곡 id와 함께 들고 있다가 렌더 때 맞춰 보는 방식은 위 result와 같다.
   */
  const [waitExpiredSongId, setWaitExpiredSongId] = useState<number | null>(null);

  useEffect(() => {
    if (!isSongLoaded || hasDuration || songId === null) return;

    const timeoutId = setTimeout(() => setWaitExpiredSongId(songId), SONG_DURATION_WAIT_MS);

    return () => clearTimeout(timeoutId);
  }, [isSongLoaded, hasDuration, songId]);

  useEffect(() => {
    if (requestKey === null || title === null || durationSeconds === undefined) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const [plainLyrics, midiJson] = await Promise.all([
          // 음절 정렬·LRCLIB 검증용이라 없어도 진행한다.
          lyricsDownloadUrl === null
            ? Promise.resolve(null)
            : fetchPlainLyrics(lyricsDownloadUrl, controller.signal).catch(() => null),
          // 음절 데이터가 없는 옛 곡도 있으므로 실패는 LRCLIB 폴백으로 넘긴다.
          midiJsonDownloadUrl === null
            ? Promise.resolve(null)
            : fetchMidiJson(midiJsonDownloadUrl, controller.signal).catch(() => null),
        ]);

        if (controller.signal.aborted) return;

        // 음절 타이밍이 있으면 그대로 끝 — 외부(LRCLIB) 조회를 아예 하지 않는다.
        const syllableLines = parseSyllableHighlights(midiJson, plainLyrics);
        if (syllableLines !== null) {
          setResult({ key: requestKey, state: { status: 'READY', lines: syllableLines } });
          return;
        }

        const response = await fetchLyricsCandidates(
          { title, artist, durationSeconds },
          controller.signal,
        );

        if (controller.signal.aborted) return;

        const resolved = selectLyrics(response.candidates, plainLyrics);

        setResult({
          key: requestKey,
          state:
            resolved === null
              ? { status: 'UNAVAILABLE', reason: response.reason ?? 'MISMATCH' }
              : { status: 'READY', lines: resolved.lines },
        });
      } catch {
        if (controller.signal.aborted) return;

        setResult({ key: requestKey, state: { status: 'UNAVAILABLE', reason: 'ERROR' } });
      }
    })();

    return () => controller.abort();
  }, [requestKey, title, artist, durationSeconds, lyricsDownloadUrl, midiJsonDownloadUrl]);

  // 지난 곡의 결과를 새 곡에 쓰지 않도록 키가 맞을 때만 인정한다.
  const load: LoadState = !isSongLoaded
    ? { status: 'IDLE' }
    : requestKey === null
      ? waitExpiredSongId === songId
        ? { status: 'UNAVAILABLE', reason: 'DURATION_UNKNOWN' }
        : { status: 'LOADING' }
      : result?.key === requestKey
        ? result.state
        : { status: 'LOADING' };

  const lines = load.status === 'READY' ? load.lines : NO_LINES;
  const current = active?.key === requestKey ? active : null;
  const activeIndex = current?.index ?? -1;

  const getPositionMs = useLyricsClock(isPerformer, engine);

  // 음절 하이라이트용 시계. 소절 틱과 같은 보정을 쓰되 선행 표시(LYRICS_LEAD_MS)는 뺀다 —
  // 소절은 미리 떠야 준비가 되지만, 음절이 발성보다 먼저 차오르면 오히려 어긋나 보인다.
  const getHighlightTimeMs = useCallback(
    () => getPositionMs() + LYRICS_SYNC_OFFSET_MS - (isPerformer ? 0 : LISTENER_LYRICS_DELAY_MS),
    [getPositionMs, isPerformer],
  );

  /**
   * 소절 경계만 찾으면 되므로 매 프레임(rAF) 돌 필요가 없다. 무대에서는 MediaPipe와
   * 오디오 처리가 이미 CPU를 쓰고 있어 100ms 간격으로 충분히 아낀다 —
   * 소절 단위 표시에서 100ms 오차는 눈에 띄지 않고, 선행 표시(LYRICS_LEAD_MS)도 있다.
   */
  useEffect(() => {
    if (phase !== 'PERFORMING' || requestKey === null || lines.length === 0) return;

    // 이 효과가 사는 동안의 직전 값. 바뀐 틱에만 상태를 갱신해 리렌더를 아낀다.
    let lastIndex = -1;
    let lastCountdown: number | null = null;

    const tick = () => {
      // 시계는 호출할 때마다 감기므로 한 틱에서 한 번만 읽는다.
      const timeMs =
        getPositionMs() +
        LYRICS_LEAD_MS +
        LYRICS_SYNC_OFFSET_MS -
        (isPerformer ? 0 : LISTENER_LYRICS_DELAY_MS);
      const index = findLineIndexAt(lines, timeMs);
      const countdown = resolveCountdown(lines, index, findNextTextIndex(lines, index), timeMs);

      if (index === lastIndex && countdown === lastCountdown) return;

      lastIndex = index;
      lastCountdown = countdown;
      setActive({ key: requestKey, index, countdown });
    };

    tick();
    const intervalId = setInterval(tick, LINE_TICK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [phase, requestKey, lines, getPositionMs, isPerformer]);

  if (load.status === 'IDLE' || load.status === 'LOADING') {
    return {
      status: load.status,
      currentLine: '',
      currentSyllables: null,
      nextLine: '',
      message: load.status === 'LOADING' ? '가사를 불러오는 중입니다' : null,
      countdown: null,
      getHighlightTimeMs,
    };
  }

  if (load.status === 'UNAVAILABLE') {
    return {
      status: 'UNAVAILABLE',
      currentLine: '',
      currentSyllables: null,
      nextLine: '',
      message: MISS_MESSAGES[load.reason],
      countdown: null,
      getHighlightTimeMs,
    };
  }

  // 재생 전(activeIndex === -1)에는 현재 소절이 없다. 첫 소절을 미리보기로 띄워 준비하게 한다.
  const nextIndex = findNextTextIndex(lines, activeIndex);

  return {
    status: 'READY',
    currentLine: activeIndex >= 0 ? (lines[activeIndex]?.text ?? '') : '',
    currentSyllables: activeIndex >= 0 ? (lines[activeIndex]?.syllables ?? null) : null,
    nextLine: nextIndex >= 0 ? lines[nextIndex].text : '',
    message: null,
    countdown: current?.countdown ?? null,
    getHighlightTimeMs,
  };
}
