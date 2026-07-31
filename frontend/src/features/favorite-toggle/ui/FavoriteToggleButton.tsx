'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { addFavoriteSong, favoriteQueryKeys, removeFavoriteSong } from '@/entities/favorite';
import { cn } from '@/shared/lib/cn';
import { showToast } from '@/shared/model/toastStore';
import { HeartIcon } from '@/shared/ui/icons/HeartIcon';

interface FavoriteToggleButtonProps {
  songId: number;
  favorite: boolean;
  className?: string;
  iconClassName?: string;
}

export function FavoriteToggleButton({
  songId,
  favorite,
  className,
  iconClassName,
}: FavoriteToggleButtonProps) {
  const queryClient = useQueryClient();

  const { mutate: toggleFavorite, isPending } = useMutation({
    mutationFn: () => (favorite ? removeFavoriteSong(songId) : addFavoriteSong(songId)),
    onError: (error) => {
      showToast(error instanceof Error ? error.message : '찜 처리에 실패했습니다.', 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.all });
      // 곡 검색 결과의 favorite 필드도 함께 갱신한다.
      queryClient.invalidateQueries({ queryKey: ['songs', 'search'] });
    },
  });

  return (
    <button
      type="button"
      aria-label={favorite ? '찜 해제' : '찜하기'}
      aria-pressed={favorite}
      disabled={isPending}
      onClick={() => toggleFavorite()}
      className={cn(
        'shrink-0 transition-colors disabled:opacity-40',
        favorite
          ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,0.55)] hover:text-cyan-200'
          : 'text-zinc-600 hover:text-zinc-400',
        className,
      )}
    >
      <HeartIcon filled={favorite} className={iconClassName} />
    </button>
  );
}
