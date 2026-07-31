import { useMutation } from '@tanstack/react-query';

import { uploadAdminSong } from '@/entities/song';

export function useUploadSongMutation() {
  return useMutation({
    mutationFn: uploadAdminSong,
  });
}
