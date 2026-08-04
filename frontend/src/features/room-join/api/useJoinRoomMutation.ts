import { useMutation } from '@tanstack/react-query';

import {
  getRoomSnapshot,
  joinRoom,
  type RoomSessionResponse,
  type RoomSnapshotResponse,
} from '@/entities/room';

export interface JoinRoomResult {
  session: RoomSessionResponse;
  snapshot: RoomSnapshotResponse | null;
}

export function useJoinRoomMutation() {
  return useMutation({
    mutationFn: async (inviteCode: string): Promise<JoinRoomResult> => {
      const session = await joinRoom(inviteCode);

      // 입장 응답에는 방 이름·모드가 없어 스냅샷으로 확인한다.
      // 스냅샷 실패가 입장 자체를 막지 않도록 null 폴백한다.
      let snapshot: RoomSnapshotResponse | null = null;
      try {
        snapshot = await getRoomSnapshot(session.roomId);
      } catch {
        snapshot = null;
      }

      return { session, snapshot };
    },
  });
}
