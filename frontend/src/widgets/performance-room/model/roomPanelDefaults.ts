import type { StagePhase } from './stageStore';

/** 로비·준비 단계 — 참가자 목록을 기본으로 펼친다 */
export function isLobbyPhase(phase: StagePhase): boolean {
  return (
    phase === 'WAITING' ||
    phase === 'SINGER_SELECT' ||
    phase === 'SONG_SELECT' ||
    phase === 'READY'
  );
}

/** 참가자 패널: 로비=열림, 노래·채점=닫힘 */
export function participantsPanelDefaultOpen(phase: StagePhase): boolean {
  return isLobbyPhase(phase);
}
