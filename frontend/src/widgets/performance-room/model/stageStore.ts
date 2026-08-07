import { create } from 'zustand';

import {
  DEFAULT_PERFORMANCE_SETTINGS,
  type PerformancePreparationStartedPayload,
  type PerformanceResumedPayload,
  type PerformanceSettings,
  type PerformanceStartedPayload,
  type PerformanceSuspendedPayload,
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
  /**
   * 가사 싱크 조회(LRCLIB)에 쓰는 곡 서명. 공연 준비 이벤트에는 제목만 오고
   * 가수·길이는 방 스냅샷에만 있어, 선곡한 본인 외에는 스냅샷으로 채워진다.
   */
  artist?: string;
  durationSeconds?: number;
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
  /**
   * 시작하기를 눌러 공연 준비(prepare)와 MR 다운로드를 요청한 상태. 선곡은 로컬 전이만
   * 하므로 서버 공연 생성과 다운로드 모두 이 시점에 시작된다 — 준비 이벤트로 URL이
   * 내려오고 다운로드가 끝나면 재생 시작을 보낸다.
   */
  mrLoadRequested: boolean;
  mrDownloadUrl: string | null;
  midiJsonDownloadUrl: string | null;
  /** 가사 파일 URL. AI 분석 파이프라인의 파일 포맷 확정 후 가사 싱크에 사용한다 */
  lyricsDownloadUrl: string | null;
  settings: PerformanceSettings;
  /** AI 채점 실패 여부 (PERFORMANCE_STATE_CHANGED → ANALYSIS_FAILED) */
  scoringFailed: boolean;
  /** 가창자 연결 끊김으로 공연이 일시 중지된 상태 */
  isSuspended: boolean;
  /** 가창자 연결이 끊긴 시각(ISO). 재접속 유예 카운트다운의 기준점 */
  suspendedAt: string | null;
  /** 재개 시 MR을 이어 재생할 위치(ms). 새 공연 시작 시 0으로 돌아간다 */
  resumeOffsetMs: number;
  // 무대 진행 전이. 서버 이벤트 수신 시 apply* 액션이 상태를 덮어쓴다.
  startSingerSelect: () => void;
  cancelSingerSelect: () => void;
  confirmSinger: (participantId: number) => void;
  confirmSong: (song: StageSong) => void;
  changeSong: () => void;
  requestMrLoad: () => void;
  startPerformance: () => void;
  finishPerformance: (score: number) => void;
  endStage: () => void;
  /** 채점 화면을 마치고 다음 가창자 선택으로 넘어간다. 끝난 공연 상태는 초기화한다 */
  advanceToSingerSelect: () => void;
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
  /** 가창자가 시작 전에 공연을 취소했다(노래 바꾸기). 가창자를 유지한 채 선곡으로 돌아간다 */
  applySongChangeCancelled: (performerParticipantId: number) => void;
  /** AI 채점 결과 수신 (LEADERBOARD_UPDATED의 updatedFinalScore) */
  applyScore: (score: number) => void;
  applyScoringFailed: () => void;
  applyPerformanceSuspended: (payload: PerformanceSuspendedPayload) => void;
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
  mrLoadRequested: false,
  mrDownloadUrl: null,
  midiJsonDownloadUrl: null,
  lyricsDownloadUrl: null,
  settings: DEFAULT_PERFORMANCE_SETTINGS,
  scoringFailed: false,
  isSuspended: false,
  suspendedAt: null,
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
  // 무대를 가리는 오버레이라 닫힌 상태로 시작한다.
  dspPanelOpen: false,
  gestureOn: true,
  micOn: true,
  ...INITIAL_PERFORMANCE_STATE,
  startSingerSelect: () => set({ phase: 'SINGER_SELECT' }),
  cancelSingerSelect: () => set({ phase: 'WAITING' }),
  confirmSinger: (participantId) =>
    set({ performerParticipantId: participantId, phase: 'SONG_SELECT' }),
  confirmSong: (song) => set({ phase: 'READY', selectedSong: song }),
  changeSong: () =>
    set({
      phase: 'SONG_SELECT',
      selectedSong: null,
      mrLoadRequested: false,
      // cancel 이벤트 전에 다시 시작하기를 눌러도 stale prepare를 스킵하지 않게 한다.
      performanceId: null,
    }),
  requestMrLoad: () => set({ mrLoadRequested: true }),
  startPerformance: () => set({ phase: 'PERFORMING', dspPanelOpen: false }),
  finishPerformance: (score) => set({ phase: 'SCORE', score }),
  endStage: () => set(INITIAL_PERFORMANCE_STATE),
  advanceToSingerSelect: () => set({ ...INITIAL_PERFORMANCE_STATE, phase: 'SINGER_SELECT' }),
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
    set((state) => ({
      performanceId: payload.performanceId,
      performerParticipantId: payload.performerParticipantId,
      selectedSong: {
        id: payload.songId,
        title: payload.songTitle,
        thumbnailUrl: payload.thumbnailImageUrl,
        difficultyLevel: payload.difficultyLevel,
        // 이벤트에는 가수·길이가 없다. 선곡할 때 이미 알고 있었다면 그대로 살려
        // 가창자는 스냅샷을 기다리지 않고 바로 가사를 조회할 수 있게 한다.
        ...(state.selectedSong?.id === payload.songId
          ? {
              artist: state.selectedSong.artist,
              durationSeconds: state.selectedSong.durationSeconds,
            }
          : {}),
      },
      mrDownloadUrl: payload.mrDownloadUrl,
      midiJsonDownloadUrl: payload.midiJsonDownloadUrl,
      lyricsDownloadUrl: payload.lyricsDownloadUrl,
      phase: 'READY',
    })),

  // 처음부터 재생하는 경우이므로 이전 공연의 재개 위치를 버린다.
  // 패널도 닫아, 앞 순서 가창자가 열어 둔 상태가 다음 곡까지 따라오지 않게 한다.
  applyPlaybackStarted: () =>
    set({
      phase: 'PERFORMING',
      isSuspended: false,
      suspendedAt: null,
      resumeOffsetMs: 0,
      dspPanelOpen: false,
    }),

  // 점수는 채점 완료 후 LEADERBOARD_UPDATED가 채운다. 그때까지 "채점 중"으로 표시된다.
  applyPlaybackFinished: () => set({ phase: 'SCORE', score: null, scoringFailed: false }),

  // 서버 settings는 4개 필드뿐이라 통째로 교체하면 로컬 전용 값(마이크 볼륨 등)이 undefined가 된다.
  applySettingsChanged: (settings) =>
    set((state) => ({ settings: { ...state.settings, ...settings } })),

  applyPerformanceCancelled: () => set(INITIAL_PERFORMANCE_STATE),

  applySongChangeCancelled: (performerParticipantId) =>
    set({ ...INITIAL_PERFORMANCE_STATE, phase: 'SONG_SELECT', performerParticipantId }),

  applyScore: (score) => set({ phase: 'SCORE', score, scoringFailed: false }),

  applyScoringFailed: () => set({ phase: 'SCORE', scoringFailed: true }),

  // suspendedAt은 서버가 유예를 재기 시작한 시각이다. 재접속 카운트다운의 기준이라 payload 값을 그대로 쓴다.
  applyPerformanceSuspended: (payload) =>
    set({ isSuspended: true, suspendedAt: payload.suspendedAt }),

  applyPerformanceResumed: (payload) =>
    set((state) => ({
      isSuspended: false,
      suspendedAt: null,
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

      // 서버에 공연이 없다. 다만 가창자 지정은 공연 생성 전에도 서버 stageRole에 남는다
      // (역할은 취소·채점 완료 시점에 해제되므로 PERFORMER가 있으면 진행 중인 지정이다).
      if (performance === null) {
        const performer = snapshot.participants.find(
          (participant) => participant.stageRole === 'PERFORMER',
        );

        // 선곡·준비 진행 중(공연 생성 전 단계)의 로컬 상태가 유일한 기준이므로 보존한다.
        if (
          state.performanceId === null &&
          (state.phase === 'SONG_SELECT' || state.phase === 'READY')
        ) {
          return state;
        }

        // 지정~선곡 사이에 새로고침한 가창자를 선곡 단계로 복원한다. 이 복원이 없으면
        // 가창자만 WAITING으로 떨어지고, 나머지는 선곡 대기 화면에서 빠져나올 수 없다.
        if (performer !== undefined) {
          return {
            ...INITIAL_PERFORMANCE_STATE,
            phase: 'SONG_SELECT',
            performerParticipantId: performer.participantId,
          };
        }

        // 가창자·곡 선택 전이면 로컬 진행을 보존하고, 취소·종료된 공연의 잔여 상태만 정리한다.
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
          // 가사 싱크 조회에 필요한 값은 스냅샷에만 있다 (공연 준비 이벤트에는 제목뿐).
          artist: performance.artist,
          durationSeconds: Math.round(performance.songDurationMs / 1000),
        },
        mrDownloadUrl: performance.mrDownloadUrl,
        midiJsonDownloadUrl: performance.midiJsonDownloadUrl,
        lyricsDownloadUrl: performance.lyricsDownloadUrl,
        settings: { ...state.settings, ...performance.settings },
        phase,
        // 채점 완료 후 새로고침하면 LEADERBOARD_UPDATED를 다시 받을 수 없다. 리더보드에
        // 이 공연의 점수가 이미 있으면 되살려 "채점 중..."에 영구히 갇히는 것을 막는다.
        score:
          phase === 'SCORE'
            ? (state.score ??
              snapshot.leaderboard?.find(
                (entry) => entry.performanceId === performance.performanceId,
              )?.finalScore ??
              null)
            : null,
        scoringFailed: performance.status === 'ANALYSIS_FAILED',
        // 로컬이 더 진행된 경우 스냅샷의 낡은 정지 상태·재생 위치로 덮어쓰지 않는다.
        isSuspended: localIsAhead ? state.isSuspended : isSuspended,
        // 일시 중지 중 새로고침해도 카운트다운이 처음부터 다시 세지 않도록 서버 시각을 복원한다.
        suspendedAt: localIsAhead
          ? state.suspendedAt
          : isSuspended
            ? performance.suspendedAt
            : null,
        resumeOffsetMs: localIsAhead
          ? state.resumeOffsetMs
          : (snapshot.playback?.playbackPositionMs ?? 0),
      };
    }),
}));
