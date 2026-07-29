import { useMutation } from '@tanstack/react-query';

import { joinRoom } from '@/entities/room';

export function useJoinRoomMutation() {
  return useMutation({
    mutationFn: (inviteCode: string) => joinRoom(inviteCode),
  });
}
