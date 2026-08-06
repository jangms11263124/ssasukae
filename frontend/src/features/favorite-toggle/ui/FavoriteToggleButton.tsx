'use client';

import { cn } from '@/shared/lib/cn';
import { HeartIcon } from '@/shared/ui/icons/HeartIcon';

import { useFavoriteToggle } from '../model/useFavoriteToggle';

interface FavoriteToggleButtonProps {
  songId: number;
  favorite: boolean;
  className?: string;
  iconClassName?: string;
}

export function FavoriteToggleButton({
  songId,
  favorite: initialFavorite,
  className,
  iconClassName,
}: FavoriteToggleButtonProps) {
  const { favorite, toggle } = useFavoriteToggle(songId, initialFavorite);

  return (
    <button
      type="button"
      aria-label={favorite ? '찜 해제' : '찜하기'}
      aria-pressed={favorite}
      onClick={(event) => {
        event.stopPropagation();
        toggle();
      }}
      className={cn(
        'shrink-0 transition-colors',
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
