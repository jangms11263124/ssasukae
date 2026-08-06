import { useEffect, useRef } from 'react';

import { useRoomStore } from '@/entities/room';

import { useCardStore } from '../../model/cardStore';
import { useOpenViduSessionContext } from '../../model/OpenViduSessionContext';
import { useStageStore } from '../../model/stageStore';
import type { RemoteMedia } from '../../model/useOpenViduSession';

/**
 * 마이크 난입(MIC_OPEN) 중 가창자에게 들리는 난입자 목소리 증폭 배율.
 * 가창자는 MR·본인 모니터링을 듣느라 시스템 볼륨을 줄여 두는 경우가 많아 원 신호로는 묻힌다.
 * 요소 volume은 1.0이 상한이라 WebAudio 게인으로 그 위를 올린다.
 */
const MIC_OPEN_BOOST_GAIN = 2.5;

function RemoteAudioElement({ media, boosted }: { media: RemoteMedia; boosted: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      // 원격 MediaStream은 협상 완료 후에야 생기므로 srcObject 연결 시점을 openvidu에 맡긴다.
      media.streamManager.addVideoElement(videoRef.current);
    }
  }, [media.streamManager]);

  useEffect(() => {
    if (!boosted) {
      return;
    }

    const element = videoRef.current;
    // 타입은 non-null이지만 협상 완료 전에는 런타임에 undefined일 수 있다
    const mediaStream: MediaStream | undefined = media.streamManager.stream.getMediaStream();
    if (element === null || mediaStream === undefined || mediaStream.getAudioTracks().length === 0) {
      return;
    }

    const context = new AudioContext();
    const source = context.createMediaStreamSource(mediaStream);
    const gain = context.createGain();
    gain.gain.value = MIC_OPEN_BOOST_GAIN;
    // 증폭된 피크가 풀스케일을 넘어 찌그러지는 것을 막는다
    const limiter = context.createDynamicsCompressor();
    source.connect(gain).connect(limiter).connect(context.destination);

    // Chromium은 원격 스트림이 미디어 요소에 붙어 있어야 WebAudio 쪽에도 소리가 흐른다 —
    // 요소 연결은 유지한 채 음소거만 해서 증폭 경로와의 이중 재생(콤 필터링)을 막는다.
    // 컨텍스트가 실제로 돌기 시작한 뒤에만 음소거한다. 증폭이 실패하면 기존 요소 재생이 그대로 남는다.
    let cancelled = false;
    context
      .resume()
      .then(() => {
        if (!cancelled && context.state === 'running') {
          element.muted = true;
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      element.muted = false;
      source.disconnect();
      void context.close().catch(() => undefined);
    };
  }, [boosted, media.streamManager]);

  return <video ref={videoRef} autoPlay playsInline />;
}

/**
 * 원격 참가자 오디오 재생 전담. 참가자 캠 그리드가 사라지면서 그리드의 <video>가 맡던
 * 음성(가창자 노래 포함) 재생을 여기서 이어받는다 — 무대의 StageCameraFeed는 하울링
 * 방지를 위해 항상 음소거라, 이 컴포넌트가 없으면 방의 모든 소리가 끊긴다.
 * 마이크 난입 중에는 가창자 화면에서만 난입자 음성을 증폭한다.
 */
export function RemoteAudioSink() {
  const { remoteStreams } = useOpenViduSessionContext();
  const activeEffect = useCardStore((state) => state.activeEffect);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const myParticipantId = useRoomStore((state) => state.session?.myParticipantId ?? null);

  // 관전자에게는 원 신호 그대로 들리므로 증폭은 가창자 본인 화면에서만 건다
  const boostedParticipantId =
    activeEffect !== null &&
    activeEffect.effectType === 'MIC_OPEN' &&
    myParticipantId !== null &&
    myParticipantId === performerParticipantId
      ? activeEffect.targetParticipantId
      : null;

  return (
    <div hidden aria-hidden="true">
      {[...remoteStreams.entries()].map(([participantId, media]) => (
        <RemoteAudioElement
          key={participantId}
          media={media}
          boosted={participantId === boostedParticipantId}
        />
      ))}
    </div>
  );
}
