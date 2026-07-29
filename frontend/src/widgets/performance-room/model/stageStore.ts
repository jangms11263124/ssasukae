import { create } from 'zustand';

import {
  DEFAULT_PERFORMANCE_SETTINGS,
  type PerformancePreparationStartedPayload,
  type PerformanceSettings,
  type PerformanceStartedPayload,
} from '@/entities/performance';

export type StagePhase =
  | 'WAITING'
  | 'SINGER_SELECT'
  | 'SONG_SELECT'
  | 'READY'
  | 'PERFORMING'
  | 'SCORE';

export interface StageSong {
  id: number;
  title: string;
}

interface StageStore {
  camOn: boolean;
  micOn: boolean;
  performerParticipantId: number | null;
  phase: StagePhase;
  score: number | null;
  selectedSong: StageSong | null;
  // ── 서버 공연 세션 상태 ──
  performanceId: number | null;
  mrDownloadUrl: string | null;
  midiJsonDownloadUrl: string | null;
  settings: PerformanceSettings;
  // 무대 진행 전이. 서버 이벤트 수신 시 apply* 액션이 상태를 덮어쓴다.
  startSingerSelect: () => void;
  confirmSinger: (participantId: number) => void;
  confirmSong: (song: StageSong) => void;
  changeSong: () => void;
  startPerformance: () => void;
  finishPerformance: (score: number) => void;
  endStage: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  // ── WebSocket 이벤트 반영 ──
  applyPerformanceStarted: (payload: PerformanceStartedPayload) => void;
  applyPreparationStarted: (payload: PerformancePreparationStartedPayload) => void;
  applyPlaybackStarted: () => void;
  applyPlaybackFinished: () => void;
  applySettingsChanged: (settings: PerformanceSettings) => void;
  applyPerformanceCancelled: () => void;
}

const INITIAL_PERFORMANCE_STATE = {
  performerParticipantId: null,
  phase: 'WAITING' as StagePhase,
  score: null,
  selectedSong: null,
  performanceId: null,
  mrDownloadUrl: null,
  midiJsonDownloadUrl: null,
  settings: DEFAULT_PERFORMANCE_SETTINGS,
};

export const useStageStore = create<StageStore>((set) => ({
  camOn: true,
  micOn: true,
  ...INITIAL_PERFORMANCE_STATE,
  startSingerSelect: () => set({ phase: 'SINGER_SELECT' }),
  confirmSinger: (participantId) =>
    set({ performerParticipantId: participantId, phase: 'SONG_SELECT' }),
  confirmSong: (song) => set({ phase: 'READY', selectedSong: song }),
  changeSong: () => set({ phase: 'SONG_SELECT', selectedSong: null }),
  startPerformance: () => set({ phase: 'PERFORMING' }),
  finishPerformance: (score) => set({ phase: 'SCORE', score }),
  endStage: () => set(INITIAL_PERFORMANCE_STATE),
  toggleMic: () => set((state) => ({ micOn: !state.micOn })),
  toggleCam: () => set((state) => ({ camOn: !state.camOn })),

  applyPerformanceStarted: (payload) =>
    set({
      performanceId: payload.performanceId,
      performerParticipantId: payload.performerParticipantId,
    }),

  applyPreparationStarted: (payload) =>
    set({
      performanceId: payload.performanceId,
      performerParticipantId: payload.performerParticipantId,
      selectedSong: { id: payload.songId, title: payload.songTitle },
      mrDownloadUrl: payload.mrDownloadUrl,
      midiJsonDownloadUrl: payload.midiJsonDownloadUrl,
      phase: 'READY',
    }),

  applyPlaybackStarted: () => set({ phase: 'PERFORMING' }),

  // 채점 결과(리더보드) 이벤트는 백엔드 미완성이라 점수 없이 SCORE 단계로 전이한다.
  applyPlaybackFinished: () => set({ phase: 'SCORE' }),

  applySettingsChanged: (settings) => set({ settings }),

  applyPerformanceCancelled: () => set(INITIAL_PERFORMANCE_STATE),
}));
