'use client';

import { useEffect, useRef, useState } from 'react';

import { openCameraStream, stopStream } from '../lib/mediaStream';

export type CameraPreviewStatus = 'idle' | 'starting' | 'live' | 'error';

interface UseCameraPreviewParams {
  cameraId: string;
  isEnabled: boolean;
}

interface CameraPreviewResult {
  /** 어떤 기기에 대한 결과인지 함께 담아 기기를 바꾸면 자동으로 'starting'으로 되돌아가게 한다. */
  cameraId: string;
  status: 'live' | 'error';
  errorMessage: string | null;
}

export function useCameraPreview({ cameraId, isEnabled }: UseCameraPreviewParams) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [result, setResult] = useState<CameraPreviewResult | null>(null);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    let isCancelled = false;
    let stream: MediaStream | null = null;

    // <video>는 조건 없이 항상 렌더되므로 이펙트 실행 시점에 이미 연결돼 있다.
    // 정리 단계에서 ref를 다시 읽지 않도록 여기서 한 번만 붙잡아 둔다.
    const videoElement = videoRef.current;

    const start = async () => {
      try {
        stream = await openCameraStream(cameraId);
      } catch {
        if (!isCancelled) {
          setResult({
            cameraId,
            status: 'error',
            errorMessage: '카메라를 열 수 없습니다. 다른 앱이 사용 중인지 확인해 주세요.',
          });
        }

        return;
      }

      // 스트림을 여는 동안 기기가 바뀌거나 언마운트되었으면 즉시 정리한다.
      if (isCancelled || !videoElement) {
        stopStream(stream);
        stream = null;
        return;
      }

      videoElement.srcObject = stream;

      await videoElement.play().catch(() => {
        // muted + playsInline이면 자동 재생되지만, 정책상 막히더라도 프리뷰 자체는 유지한다.
      });

      if (!isCancelled) {
        setResult({ cameraId, status: 'live', errorMessage: null });
      }
    };

    void start();

    return () => {
      isCancelled = true;

      if (videoElement) {
        videoElement.srcObject = null;
      }

      // track.stop()을 빼먹으면 페이지를 떠난 뒤에도 카메라 표시등이 켜져 있다.
      stopStream(stream);
      stream = null;
    };
  }, [cameraId, isEnabled]);

  const isCurrentResult = result?.cameraId === cameraId;

  let status: CameraPreviewStatus = 'starting';
  if (!isEnabled) {
    status = 'idle';
  } else if (isCurrentResult) {
    status = result.status;
  }

  return {
    videoRef,
    status,
    errorMessage: isEnabled && isCurrentResult ? result.errorMessage : null,
  };
}
