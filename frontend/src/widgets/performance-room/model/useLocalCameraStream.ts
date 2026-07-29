'use client';

import { useEffect, useState } from 'react';

// 본인 캠 표시용 로컬 카메라 스트림 훅.
// OpenVidu 연동 전까지 getUserMedia로 직접 스트림을 얻고, 비활성화·언마운트 시 트랙을 해제한다.
export function useLocalCameraStream(enabled: boolean): MediaStream | null {
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let acquired: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        acquired = mediaStream;
        setStream(mediaStream);
      })
      .catch(() => {
        // 권한 거부·장치 없음이면 스트림 없이 플레이스홀더 배경을 유지한다.
      });

    return () => {
      cancelled = true;
      acquired?.getTracks().forEach((track) => track.stop());
      setStream(null);
    };
  }, [enabled]);

  return stream;
}
