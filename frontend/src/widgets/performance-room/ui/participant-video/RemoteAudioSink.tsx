'use client';

import { useEffect, useRef } from 'react';

import { useOpenViduSessionContext } from '../../model/OpenViduSessionContext';
import type { RemoteMedia } from '../../model/useOpenViduSession';

function RemoteAudioElement({ media }: { media: RemoteMedia }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      // 원격 MediaStream은 협상 완료 후에야 생기므로 srcObject 연결 시점을 openvidu에 맡긴다.
      media.streamManager.addVideoElement(videoRef.current);
    }
  }, [media.streamManager]);

  return <video ref={videoRef} autoPlay playsInline />;
}

/**
 * 원격 참가자 오디오 재생 전담. 참가자 캠 그리드가 사라지면서 그리드의 <video>가 맡던
 * 음성(가창자 노래 포함) 재생을 여기서 이어받는다 — 무대의 StageCameraFeed는 하울링
 * 방지를 위해 항상 음소거라, 이 컴포넌트가 없으면 방의 모든 소리가 끊긴다.
 */
export function RemoteAudioSink() {
  const { remoteStreams } = useOpenViduSessionContext();

  return (
    <div hidden aria-hidden="true">
      {[...remoteStreams.entries()].map(([participantId, media]) => (
        <RemoteAudioElement key={participantId} media={media} />
      ))}
    </div>
  );
}
