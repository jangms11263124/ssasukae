'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchLyricsCandidates,
  fetchPlainLyrics,
  findLineIndexAt,
  findNextTextIndex,
  selectLyrics,
  LYRICS_LEAD_MS,
  LYRICS_SYNC_OFFSET_MS,
  type LyricsLine,
  type LyricsMissReason,
} from '@/features/lyrics-sync';
import type { VocalAudioEngine } from '@/features/vocal-audio-engine';

import { useStageAudioContext } from './StageAudioContext';
import { useStageStore } from './stageStore';

/** 조회 실패 사유. 서버가 준 사유에 클라이언트 쪽 사유를 더한다 */
type MissReason = LyricsMissReason | 'MISMATCH' | 'ERROR';

type LoadState =
  | { status: 'IDLE' }
  | { status: 'LOADING' }
  | { status: 'READY'; lines: LyricsLine[] }
  | { status: 'UNAVAILABLE'; reason: MissReason };

const MISS_MESSAGES: Record<MissReason, string> = {
  NOT_FOUND: '이 곡의 싱크 가사를 찾지 못했습니다',
  NO_SYNCED_LYRICS: '이 곡은 타임스탬프가 있는 가사가 없습니다',
  RATE_LIMITED: '가사 서버 요청이 많아 가사를 불러오지 못했습니다',
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
  /** 다음 소절 미리보기. 재생 전에는 첫 소절이 들어온다 */
  nextLine: string;
  /** LOADING·UNAVAILABLE일 때 보여줄 안내 문구 */
  message: string | null;
}

/**
 * 가사 시간축의 현재 위치(ms)를 읽는 함수를 만든다.
 *
 * 가창자는 오디오 엔진의 MR 재생 위치를 그대로 쓴다 — 템포 변경과 재개 오프셋이 이미
 * 반영된 축이라 정답 MIDI·채점과도 같은 기준이 된다.
 *
 * 청자는 엔진이 없다(가창자만 MR을 재생한다). 그래서 재생이 흐른 만큼을 로컬에서 세되,
 * 시작 위치는 서버가 준 값(resumeOffsetMs)을 쓴다 — 공연 중에 입장한 참가자나 재개된
 * 공연에서도 중간부터 맞물린다. 다만 벽시계라서, 가창자가 템포를 바꾸면 그만큼 어긋난다.
 */
function useLyricsClock(isPerformer: boolean, engine: VocalAudioEngine | null): () => number {
  const phase = useStageStore((state) => state.phase);
  const isSuspended = useStageStore((state) => state.isSuspended);
  const resumeOffsetMs = useStageStore((state) => state.resumeOffsetMs);

  const isRunning = phase === 'PERFORMING' && !isSuspended;
  const baselineRef = useRef<{ startedAt: number; offsetMs: number } | null>(null);

  // 재생이 시작·재개될 때 기준점을 새로 잡고, 멈춘 동안에는 비워 시간이 흐르지 않게 한다.
  // 공연마다 resumeOffsetMs가 0으로 돌아오므로 기준점도 반드시 함께 갱신되어야 한다.
  useEffect(() => {
    if (isPerformer) return;

    baselineRef.current = isRunning
      ? { startedAt: performance.now(), offsetMs: resumeOffsetMs }
      : null;
  }, [isPerformer, isRunning, resumeOffsetMs]);

  return useCallback(() => {
    if (isPerformer) return engine?.getMrPositionMs() ?? 0;

    const baseline = baselineRef.current;
    if (baseline === null) return resumeOffsetMs;

    return baseline.offsetMs + (performance.now() - baseline.startedAt);
  }, [isPerformer, engine, resumeOffsetMs]);
}

/**
 * 선곡된 곡의 싱크 가사를 LRCLIB에서 받아, MR 재생 위치에 맞춰 소절을 넘긴다.
 * useStageAudioEngine·useStageScoring과 같은 자리의 도메인 접착 훅이다.
 *
 * 백엔드는 타임스탬프 없는 가사 원문만 주므로 타임스탬프는 LRCLIB에서 받는다.
 * 대신 그 원문을 정답지로 써서 후보가 같은 곡인지 대조한다 (동명이곡 오매칭 방지).
 */
export function useSyncedLyrics(isPerformer: boolean): SyncedLyricsState {
  const phase = useStageStore((state) => state.phase);
  const selectedSong = useStageStore((state) => state.selectedSong);
  const lyricsDownloadUrl = useStageStore((state) => state.lyricsDownloadUrl);
  const { engine } = useStageAudioContext();

  const songId = selectedSong?.id ?? null;
  const title = selectedSong?.title ?? null;
  const artist = selectedSong?.artist;
  const durationSeconds = selectedSong?.durationSeconds;

  // MR과 같은 타이밍에 미리 받는다. 공연이 시작된 뒤에 받으면 첫 소절을 놓친다.
  const shouldLoad = (phase === 'READY' || phase === 'PERFORMING') && songId !== null;

  /**
   * 이 조회를 식별하는 키. 결과를 키와 함께 들고 있다가 렌더 때 지금 키와 맞춰 보는 방식으로
   * 곡이 바뀔 때의 초기화를 처리한다 — 효과 안에서 setState로 되돌리면 렌더가 한 번 더 돈다.
   * artist·durationSeconds는 스냅샷이 늦게 채우므로, 채워지면 키가 바뀌며 다시 조회된다.
   */
  const requestKey = shouldLoad
    ? `${songId}|${artist ?? ''}|${durationSeconds ?? ''}|${lyricsDownloadUrl ?? ''}`
    : null;

  const [result, setResult] = useState<{ key: string; state: LoadState } | null>(null);
  const [active, setActive] = useState<{ key: string; index: number } | null>(null);

  useEffect(() => {
    if (requestKey === null || title === null) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const [response, plainLyrics] = await Promise.all([
          fetchLyricsCandidates({ title, artist, durationSeconds }, controller.signal),
          // 검증용이라 없어도 진행한다. 실패하면 검증을 건너뛰고 1순위 후보를 쓴다.
          lyricsDownloadUrl === null
            ? Promise.resolve(null)
            : fetchPlainLyrics(lyricsDownloadUrl, controller.signal).catch(() => null),
        ]);

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
  }, [requestKey, title, artist, durationSeconds, lyricsDownloadUrl]);

  // 지난 곡의 결과를 새 곡에 쓰지 않도록 키가 맞을 때만 인정한다.
  const load: LoadState =
    requestKey === null
      ? { status: 'IDLE' }
      : result?.key === requestKey
        ? result.state
        : { status: 'LOADING' };

  const lines = load.status === 'READY' ? load.lines : NO_LINES;
  const activeIndex = active?.key === requestKey ? active.index : -1;

  const getPositionMs = useLyricsClock(isPerformer, engine);

  /**
   * 소절 경계만 찾으면 되므로 매 프레임(rAF) 돌 필요가 없다. 무대에서는 MediaPipe와
   * 오디오 처리가 이미 CPU를 쓰고 있어 100ms 간격으로 충분히 아낀다 —
   * 소절 단위 표시에서 100ms 오차는 눈에 띄지 않고, 선행 표시(LYRICS_LEAD_MS)도 있다.
   */
  useEffect(() => {
    if (phase !== 'PERFORMING' || requestKey === null || lines.length === 0) return;

    // 이 효과가 사는 동안의 직전 인덱스. 값이 바뀐 틱에만 상태를 갱신해 리렌더를 아낀다.
    let lastIndex = -1;

    const tick = () => {
      const timeMs = getPositionMs() + LYRICS_LEAD_MS + LYRICS_SYNC_OFFSET_MS;
      const index = findLineIndexAt(lines, timeMs);

      if (index !== lastIndex) {
        lastIndex = index;
        setActive({ key: requestKey, index });
      }
    };

    tick();
    const intervalId = setInterval(tick, LINE_TICK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [phase, requestKey, lines, getPositionMs]);

  if (load.status === 'IDLE' || load.status === 'LOADING') {
    return {
      status: load.status,
      currentLine: '',
      nextLine: '',
      message: load.status === 'LOADING' ? '가사를 불러오는 중입니다' : null,
    };
  }

  if (load.status === 'UNAVAILABLE') {
    return {
      status: 'UNAVAILABLE',
      currentLine: '',
      nextLine: '',
      message: MISS_MESSAGES[load.reason],
    };
  }

  // 재생 전(activeIndex === -1)에는 현재 소절이 없다. 첫 소절을 미리보기로 띄워 준비하게 한다.
  const nextIndex = findNextTextIndex(lines, activeIndex);

  return {
    status: 'READY',
    currentLine: activeIndex >= 0 ? (lines[activeIndex]?.text ?? '') : '',
    nextLine: nextIndex >= 0 ? lines[nextIndex].text : '',
    message: null,
  };
}
