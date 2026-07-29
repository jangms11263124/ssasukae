import { useMutation } from '@tanstack/react-query';

import { createRoom, type CreateRoomRequest } from '@/entities/room';

export function useCreateRoomMutation() {
  return useMutation({
    mutationFn: (request: CreateRoomRequest) => createRoom(request),
  });
}
