import { create } from 'zustand';

import {
  DEFAULT_PERFORMANCE_SETTINGS,
  type PerformancePreparationStartedPayload,
  type PerformanceResumedPayload,
  type PerformanceSettings,
  type PerformanceStartedPayload,
} from '@/entities/performance';
import type { RoomSnapshotResponse } from '@/entities/room';

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
  thumbnailUrl?: string | null;
  difficultyLevel?: number | null;
}

interface StageStore {
  camOn: boolean;
  /** DSP 조절 패널 노출 여부. 제스처와 버튼 양쪽에서 여닫는다 */
  dspPanelOpen: boolean;
  /** 제스처 인식 사용 여부. MediaPipe CPU 절약 + 오작동 시 끌 수 있는 탈출구 */
  gestureOn: boolean;
  micOn: boolean;
  performerParticipantId: number | null;
  phase: StagePhase;
  score: number | null;
  selectedSong: StageSong | null;
  // ── 서버 공연 세션 상태 ──
  performanceId: number | null;
  mrDownloadUrl: string | null;
  midiJsonDownloadUrl: string | null;
  /** 가사 파일 URL. AI 분석 파이프라인의 파일 포맷 확정 후 가사 싱크에 사용한다 */
  lyricsDownloadUrl: string | null;
  settings: PerformanceSettings;
  /** AI 채점 실패 여부 (PERFORMANCE_STATE_CHANGED → ANALYSIS_FAILED) */
  scoringFailed: boolean;
  /** 가창자 연결 끊김으로 공연이 일시 중지된 상태 */
  isSuspended: boolean;
  /** 재개 시 MR을 이어 재생할 위치(ms). 새 공연 시작 시 0으로 돌아간다 */
  resumeOffsetMs: number;
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
  toggleGesture: () => void;
  setDspPanelOpen: (isOpen: boolean) => void;
  toggleDspPanel: () => void;
  // ── WebSocket 이벤트 반영 ──
  applyPerformanceStarted: (payload: PerformanceStartedPayload) => void;
  applyPreparationStarted: (payload: PerformancePreparationStartedPayload) => void;
  applyPlaybackStarted: () => void;
  applyPlaybackFinished: () => void;
  applySettingsChanged: (settings: PerformanceSettings) => void;
  applyPerformanceCancelled: () => void;
  /** AI 채점 결과 수신 (LEADERBOARD_UPDATED의 updatedFinalScore) */
  applyScore: (score: number) => void;
  applyScoringFailed: () => void;
  applyPerformanceSuspended: () => void;
  applyPerformanceResumed: (payload: PerformanceResumedPayload) => void;
  /** 입장 또는 소켓 재연결 시 놓친 공연 이벤트를 서버 스냅샷으로 복원한다. */
  hydrateFromRoomSnapshot: (snapshot: RoomSnapshotResponse) => void;
}

const INITIAL_PERFORMANCE_STATE = {
  performerParticipantId: null,
  phase: 'WAITING' as StagePhase,
  score: null,
  selectedSong: null,
  performanceId: null,
  mrDownloadUrl: null,
  midiJsonDownloadUrl: null,
  lyricsDownloadUrl: null,
  settings: DEFAULT_PERFORMANCE_SETTINGS,
  scoringFailed: false,
  isSuspended: false,
  resumeOffsetMs: 0,
};

// 스냅샷과 로컬 중 어느 쪽이 더 진행됐는지 비교하는 순서. 서버 공연이 존재하는 단계만 다룬다.
const SERVER_PHASE_ORDER: Partial<Record<StagePhase, number>> = {
  READY: 1,
  PERFORMING: 2,
  SCORE: 3,
};

// 기기 토글은 INITIAL_PERFORMANCE_STATE에 넣지 않는다. 넣으면 공연마다 초기화된다.
export const useStageStore = create<StageStore>((set) => ({
  camOn: true,
  dspPanelOpen: true,
  gestureOn: true,
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
  // 캠을 끄면 손 인식 입력이 사라진다. "켜져 있는데 조작은 안 되는" 상태를 막는다.
  toggleCam: () =>
    set((state) => {
      const camOn = !state.camOn;

      return camOn ? { camOn } : { camOn, gestureOn: false, dspPanelOpen: false };
    }),
  toggleGesture: () => set((state) => ({ gestureOn: !state.gestureOn })),
  setDspPanelOpen: (isOpen) => set({ dspPanelOpen: isOpen }),
  toggleDspPanel: () => set((state) => ({ dspPanelOpen: !state.dspPanelOpen })),

  applyPerformanceStarted: (payload) =>
    set({
      performanceId: payload.performanceId,
      performerParticipantId: payload.performerParticipantId,
    }),

  applyPreparationStarted: (payload) =>
    set({
      performanceId: payload.performanceId,
      performerParticipantId: payload.performerParticipantId,
      selectedSong: {
        id: payload.songId,
        title: payload.songTitle,
        thumbnailUrl: payload.thumbnailImageUrl,
        difficultyLevel: payload.difficultyLevel,
      },
      mrDownloadUrl: payload.mrDownloadUrl,
      midiJsonDownloadUrl: payload.midiJsonDownloadUrl,
      lyricsDownloadUrl: payload.lyricsDownloadUrl,
      phase: 'READY',
    }),

  // 처음부터 재생하는 경우이므로 이전 공연의 재개 위치를 버린다.
  applyPlaybackStarted: () =>
    set({ phase: 'PERFORMING', isSuspended: false, resumeOffsetMs: 0 }),

  // 점수는 채점 완료 후 LEADERBOARD_UPDATED가 채운다. 그때까지 "채점 중"으로 표시된다.
  applyPlaybackFinished: () => set({ phase: 'SCORE', score: null, scoringFailed: false }),

  // 서버 settings는 4개 필드뿐이라 통째로 교체하면 로컬 전용 값(마이크 볼륨 등)이 undefined가 된다.
  applySettingsChanged: (settings) =>
    set((state) => ({ settings: { ...state.settings, ...settings } })),

  applyPerformanceCancelled: () => set(INITIAL_PERFORMANCE_STATE),

  applyScore: (score) => set({ phase: 'SCORE', score, scoringFailed: false }),

  applyScoringFailed: () => set({ phase: 'SCORE', scoringFailed: true }),

  applyPerformanceSuspended: () => set({ isSuspended: true }),

  applyPerformanceResumed: (payload) =>
    set((state) => ({
      isSuspended: false,
      performanceId: payload.performanceId,
      performerParticipantId: payload.performerParticipantId,
      resumeOffsetMs: payload.resumePositionMs,
      // 서버 settings는 4개 필드만 관리하므로 로컬 전용 값(마이크 볼륨 등)은 유지한다.
      settings: { ...state.settings, ...payload.settings },
      phase: payload.currentStatus === 'PLAYING' ? 'PERFORMING' : 'READY',
    })),

  hydrateFromRoomSnapshot: (snapshot) =>
    set((state) => {
      const performance = snapshot.performance;

      // 서버에 공연이 없다. 가창자·곡 선택은 아직 공연이 만들어지기 전 단계라 로컬 진행이
      // 유일한 기준이므로 보존하고, 취소·종료된 공연의 잔여 상태만 정리한다.
      if (performance === null) {
        return state.performanceId === null ? state : INITIAL_PERFORMANCE_STATE;
      }

      // 스냅샷 요청 도중 더 최신 공연 이벤트가 도착했다면 과거 공연으로 되돌리지 않는다.
      if (state.performanceId !== null && state.performanceId > performance.performanceId) {
        return state;
      }

      const isSuspended = performance.status === 'SUSPENDED';
      const effectiveStatus = isSuspended
        ? (performance.suspendedFromStatus ?? 'PREPARING')
        : performance.status;
      const snapshotPhase: StagePhase =
        effectiveStatus === 'PLAYING'
          ? 'PERFORMING'
          : effectiveStatus === 'ANALYZING' ||
              effectiveStatus === 'ANALYSIS_FAILED' ||
              effectiveStatus === 'FINISHED'
            ? 'SCORE'
            : 'READY';
      // 같은 공연인데 로컬이 더 진행돼 있다면(이벤트가 스냅샷 응답보다 먼저 도착) 되돌리지 않는다.
      const localIsAhead =
        state.performanceId === performance.performanceId &&
        (SERVER_PHASE_ORDER[state.phase] ?? 0) > (SERVER_PHASE_ORDER[snapshotPhase] ?? 0);
      const phase = localIsAhead ? state.phase : snapshotPhase;

      return {
        performanceId: performance.performanceId,
        performerParticipantId: performance.performerParticipantId,
        selectedSong: {
          id: performance.songId,
          title: performance.songTitle,
          thumbnailUrl: performance.thumbnailImageUrl,
          difficultyLevel: performance.difficultyLevel,
        },
        mrDownloadUrl: performance.mrDownloadUrl,
        midiJsonDownloadUrl: performance.midiJsonDownloadUrl,
        lyricsDownloadUrl: performance.lyricsDownloadUrl,
        settings: { ...state.settings, ...performance.settings },
        phase,
        score: phase === 'SCORE' ? state.score : null,
        scoringFailed: performance.status === 'ANALYSIS_FAILED',
        // 로컬이 더 진행된 경우 스냅샷의 낡은 정지 상태·재생 위치로 덮어쓰지 않는다.
        isSuspended: localIsAhead ? state.isSuspended : isSuspended,
        resumeOffsetMs: localIsAhead
          ? state.resumeOffsetMs
          : (snapshot.playback?.playbackPositionMs ?? 0),
      };
    }),
}));
