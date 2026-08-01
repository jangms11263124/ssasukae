'use client';

import { useEffect, useRef, type RefObject } from 'react';

interface StageCameraFeedProps {
  stream: MediaStream;
  /** 손 인식이 이 <video>를 프레임 소스로 사용한다 */
  videoRef?: RefObject<HTMLVideoElement | null>;
}

// 셀프 뷰라 거울처럼 좌우 반전한다. MediaPipe의 selfieMode와 짝이라 떼면 커서가 뒤집힌다.
export function StageCameraFeed({ stream, videoRef }: StageCameraFeedProps) {
  const localRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? localRef;

  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [ref, stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      aria-label="내 캠 화면"
      className="absolute inset-0 size-full -scale-x-100 object-cover"
    />
  );
}
