'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { useSyncedLyrics, type SyncedLyricsState } from './useSyncedLyrics';

// Provider 밖(스토리북·테스트 등)에서도 안전하게 동작하도록 빈 상태를 기본값으로 둔다.
const FALLBACK_LYRICS: SyncedLyricsState = {
  status: 'IDLE',
  currentLine: '',
  nextLine: '',
  message: null,
  countdown: null,
};

const StageLyricsContext = createContext<SyncedLyricsState>(FALLBACK_LYRICS);

interface StageLyricsProviderProps {
  isPerformer: boolean;
  children: ReactNode;
}

/**
 * 가사 싱크를 무대(PerformingStage)보다 위에서 공급한다.
 *
 * 무대 뷰는 PERFORMING에서야 마운트되므로, 조회를 무대 안에서 시작하면 LRCLIB 응답과
 * 가사 원문 다운로드가 첫 소절과 경쟁한다. MR 선로딩과 같은 이유로 READY부터 살아 있어야
 * 재생 시점에는 이미 타임스탬프를 들고 있게 된다.
 *
 * MR 재생 위치를 읽어야 하므로 StageAudioProvider보다 안쪽에 있어야 한다.
 */
export function StageLyricsProvider({ isPerformer, children }: StageLyricsProviderProps) {
  const lyrics = useSyncedLyrics(isPerformer);

  return <StageLyricsContext.Provider value={lyrics}>{children}</StageLyricsContext.Provider>;
}

export function useStageLyricsContext(): SyncedLyricsState {
  return useContext(StageLyricsContext);
}
