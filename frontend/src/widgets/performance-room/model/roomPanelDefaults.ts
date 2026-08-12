import type { StagePhase } from './stageStore';

/**
 * 참가자 패널 초기·자동 닫힘 기준.
 * true = phase 진입 시 패널을 열어 둬도 되는 단계, false = 가려야 해서 자동으로 닫는다.
 * phase 전환 시 자동으로 여는 동작은 하지 않는다 (usePhaseSyncedPanelOpen).
 */
export function participantsPanelDefaultOpen(phase: StagePhase): boolean {
  return (
    phase === 'WAITING' ||
    phase === 'SONG_SELECT' ||
    phase === 'READY'
  );
}
