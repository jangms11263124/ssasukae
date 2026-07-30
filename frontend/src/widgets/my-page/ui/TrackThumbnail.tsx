import { cn } from '@/shared/lib/cn';

import { toImageSrc } from '../lib/formatters';

interface TrackThumbnailProps {
  thumbnailUrl: string | null;
  title: string;
  size: number;
  className?: string;
}

export function TrackThumbnail({ thumbnailUrl, title, size, className }: TrackThumbnailProps) {
  const imageSrc = toImageSrc(thumbnailUrl);

  return (
    <div
      className={cn('shrink-0 overflow-hidden border border-white/[0.07] bg-black/50', className)}
      style={{ width: size, height: size }}
    >
      {imageSrc && (
        // next.config.ts에 remotePatterns가 없어 next/image를 쓸 수 없다.
        // 기존 곡 검색 모달과 동일한 방식으로 처리한다.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt={`${title} 앨범 아트`} className="size-full object-cover" />
      )}
    </div>
  );
}
