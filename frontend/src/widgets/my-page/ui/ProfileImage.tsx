'use client';

import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

import { toImageSrc } from '../lib/formatters';
import { PencilIcon } from './icons';

interface ProfileImageProps {
  profileImageUrl: string | null;
  nickname: string;
  /** EDIT PROFILE로 편집 모드에 들어갔을 때만 수정 버튼을 노출한다. */
  isEditing: boolean;
  isUploading: boolean;
  onEditImage: () => void;
}

export function ProfileImage({
  profileImageUrl,
  nickname,
  isEditing,
  isUploading,
  onEditImage,
}: ProfileImageProps) {
  const imageSrc = toImageSrc(profileImageUrl);

  return (
    <div className="relative size-40 shrink-0 sm:size-52">
      <div
        className={cn(
          'size-full overflow-hidden border bg-black/40 transition-colors',
          isEditing ? 'border-cyan-400/60' : 'border-white/10',
        )}
      >
        {imageSrc ? (
          // next.config.ts에 remotePatterns가 없어 next/image를 쓸 수 없다.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={`${nickname} 프로필 이미지`}
            className="size-full object-cover"
          />
        ) : (
          <div
            className={cn(
              jetBrainsMono.className,
              'flex size-full flex-col items-center justify-center gap-2 text-zinc-600',
            )}
          >
            <span className="text-2xl font-bold text-zinc-500">
              {nickname.slice(0, 1).toUpperCase() || '?'}
            </span>
            <span className="text-[0.5rem] tracking-[0.12em]">NO_IMAGE</span>
          </div>
        )}
      </div>

      {isEditing && (
        <button
          type="button"
          onClick={onEditImage}
          disabled={isUploading}
          aria-label={isUploading ? '프로필 이미지 업로드 중' : '프로필 이미지 변경'}
          className={cn(
            'absolute bottom-2 right-2 flex size-8 items-center justify-center border border-cyan-400/60 bg-black/80 text-cyan-300 backdrop-blur-sm transition-colors hover:border-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300',
            isUploading && 'animate-pulse cursor-wait opacity-60',
          )}
        >
          <PencilIcon />
        </button>
      )}
    </div>
  );
}
