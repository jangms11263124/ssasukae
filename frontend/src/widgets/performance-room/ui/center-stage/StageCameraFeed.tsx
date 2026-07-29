'use client';

import { useEffect, useRef } from 'react';

interface StageCameraFeedProps {
  stream: MediaStream;
}

// 무대 배경에 본인 캠 스트림을 꽉 채워 보여준다. 셀프 뷰라 거울처럼 좌우 반전한다.
export function StageCameraFeed({ stream }: StageCameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      aria-label="내 캠 화면"
      className="absolute inset-0 size-full -scale-x-100 object-cover"
    />
  );
}
