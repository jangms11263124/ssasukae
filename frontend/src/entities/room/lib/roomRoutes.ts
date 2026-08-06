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

/** buildRoomPath가 만든 roomId 쿼리를 되읽는다. 없거나 양의 정수가 아니면 null */
export function parseRoomIdParam(raw: string | string[] | undefined): number | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
