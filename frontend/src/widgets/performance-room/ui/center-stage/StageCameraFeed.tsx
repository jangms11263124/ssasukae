'use client';

import { useEffect, useRef, type RefObject } from 'react';

import type { StreamManager } from 'openvidu-browser';

import { cn } from '@/shared/lib/cn';

interface StageCameraFeedProps {
  /** 로컬 캠은 MediaStream, 원격 가창자 캠은 StreamManager(Subscriber)를 받는다 */
  source: MediaStream | StreamManager;
  /** 셀프 뷰만 거울처럼 좌우 반전한다. MediaPipe의 selfieMode와 짝이라 떼면 커서가 뒤집힌다 */
  mirrored: boolean;
  /** 손 인식이 이 <video>를 프레임 소스로 사용한다 */
  videoRef?: RefObject<HTMLVideoElement | null>;
}

// 오디오는 참가자 캠 그리드 쪽에서 재생하므로 여기서는 항상 음소거한다.
// 셀프 뷰에서는 하울링 방지 역할도 겸한다.
export function StageCameraFeed({ source, mirrored, videoRef }: StageCameraFeedProps) {
  const localRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? localRef;

  useEffect(() => {
    if (ref.current === null) {
      return;
    }

    if (source instanceof MediaStream) {
      ref.current.srcObject = source;
    } else {
      // 원격 MediaStream은 협상 완료 후에야 생기므로 srcObject 연결 시점을 openvidu에 맡긴다.
      source.addVideoElement(ref.current);
    }
  }, [ref, source]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      aria-label={mirrored ? '내 캠 화면' : '가창자 캠 화면'}
      className={cn('absolute inset-0 size-full object-cover', mirrored && '-scale-x-100')}
    />
  );
}
