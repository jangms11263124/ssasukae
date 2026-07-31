'use client';

import { cn } from '@/shared/lib/cn';

interface SongThumbnailProps {
  src: string | null;
  className?: string;
}

/** 곡 썸네일. src가 없거나 이미지를 불러오지 못하면 그라데이션 플레이스홀더를 보여준다. */
export function SongThumbnail({ src, className }: SongThumbnailProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative shrink-0 overflow-hidden border border-white/10 bg-[linear-gradient(135deg,#2c2c33,#131316)]',
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </div>
  );
}
