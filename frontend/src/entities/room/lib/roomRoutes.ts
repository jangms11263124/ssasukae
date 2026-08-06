import type { RoomMode } from '../types';

const MODE_PATH_SEGMENT: Record<RoomMode, string> = {
  GENERAL: 'general',
  BATTLE: 'battle',
  LOW_LATENCY: 'low-latency',
};

/** 모드별 방 화면 경로 */
export function buildRoomPath(mode: RoomMode, roomId: number): string {
  return `/rooms/${MODE_PATH_SEGMENT[mode]}?roomId=${roomId}`;
}
