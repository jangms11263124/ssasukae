'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { VocalAudioEngineState } from '@/features/vocal-audio-engine';

import { useStageAudioEngine } from './useStageAudioEngine';
import { useStageScoring } from './useStageScoring';

// Provider 밖(스토리북·테스트 등)에서도 안전하게 동작하도록 빈 상태를 기본값으로 둔다.
const FALLBACK_AUDIO: VocalAudioEngineState = {
  isEngineReady: false,
  isMrLoaded: false,
  error: null,
  retryLoadMr: () => undefined,
  getBroadcastStream: () => null,
  engine: null,
};

const StageAudioContext = createContext<VocalAudioEngineState>(FALLBACK_AUDIO);

interface StageAudioProviderProps {
  /** 엔진·채점 수집은 가창자에게만 산다 */
  isPerformer: boolean;
  children: ReactNode;
}

/**
 * 오디오 엔진·채점 수집을 무대(CenterStage)와 우측 무대 진행 패널이 함께 쓰도록
 * 화면 레벨에서 공급한다 — READY의 MR 다운로드 상태(isMrLoaded)를 패널이 읽어야 한다.
 * 소켓·OpenVidu 컨텍스트에 의존하므로 두 Provider보다 안쪽에 있어야 한다.
 */
export function StageAudioProvider({ isPerformer, children }: StageAudioProviderProps) {
  const audioEngine = useStageAudioEngine(isPerformer);

  // 채점 입력(STT·음정) 수집. 엔진이 연 마이크와 MR 시간축을 그대로 나눠 쓴다.
  useStageScoring(isPerformer, audioEngine.engine);

  return <StageAudioContext.Provider value={audioEngine}>{children}</StageAudioContext.Provider>;
}

export function useStageAudioContext(): VocalAudioEngineState {
  return useContext(StageAudioContext);
}
