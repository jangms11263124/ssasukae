'use client';

interface SongThumbnailImageProps {
  src: string;
}

/** onError로 깨진 이미지를 숨기는 leaf. 썸네일 셸은 서버 컴포넌트로 둔다. */
export function SongThumbnailImage({ src }: SongThumbnailImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
      className="absolute inset-0 size-full object-cover"
    />
  );
}
