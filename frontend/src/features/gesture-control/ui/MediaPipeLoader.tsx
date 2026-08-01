'use client';

import Script from 'next/script';
import { useState } from 'react';

import { MEDIAPIPE_HANDS_SRC } from '../config/gestureConfig';

interface MediaPipeLoaderProps {
  onReady: () => void;
}

/**
 * MediaPipe Hands를 CDN에서 로드한다. onLoad가 아니라 onReady를 쓰는 이유는,
 * 다른 화면에 갔다 돌아오면 스크립트가 이미 로드돼 있어 onLoad가 다시 불리지
 * 않기 때문이다. onReady는 재마운트에도 불려 준비 상태가 복원된다.
 */
export function MediaPipeLoader({ onReady }: MediaPipeLoaderProps) {
  const [isNotified, setIsNotified] = useState(false);

  return (
    <Script
      src={MEDIAPIPE_HANDS_SRC}
      strategy="afterInteractive"
      crossOrigin="anonymous"
      onReady={() => {
        if (isNotified) return;
        setIsNotified(true);
        onReady();
      }}
    />
  );
}
