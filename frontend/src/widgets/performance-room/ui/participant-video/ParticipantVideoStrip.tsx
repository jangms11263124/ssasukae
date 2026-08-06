import { useEffect, useRef } from 'react';

import type { RoomParticipant } from '@/entities/participant';
import { useRoomStore } from '@/entities/room';

import { useOpenViduSessionContext } from '../../model/OpenViduSessionContext';
import { useStageStore } from '../../model/stageStore';
import type { RemoteMedia } from '../../model/useOpenViduSession';
import { MyCardDock } from '../cards/MyCardDock';
import { StageIdentityBadge } from '../center-stage/StageIdentityBadge';

function toProfileSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : null;
}

function ProfilePlaceholder({
  nickname,
  profileImageUrl,
}: {
  nickname: string;
  profileImageUrl: string | null;
}) {
  const imageSrc = toProfileSrc(profileImageUrl);

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt=""
        className="size-14 rounded-full object-cover ring-1 ring-white/15"
      />
    );
  }

  return (
    <div className="grid size-14 place-items-center rounded-full bg-zinc-800 ring-1 ring-white/10">
      <span className="font-mono text-sm font-semibold text-zinc-400">
        {nickname.trim().charAt(0) || '?'}
      </span>
    </div>
  );
}

interface LocalVideoProps {
  stream: MediaStream;
  nickname: string;
}

function LocalVideo({ stream, nickname }: LocalVideoProps) {
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
      aria-label={`${nickname} 캠 화면`}
      className="absolute inset-0 size-full -scale-x-100 object-cover"
    />
  );
}

interface RemoteVideoProps {
  media: RemoteMedia;
  nickname: string;
}

// 화면 전용. 음성은 RemoteAudioSink가 전담하므로 여기서 또 재생하면 이중 재생이 된다.
function RemoteVideo({ media, nickname }: RemoteVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      // 원격 MediaStream은 협상 완료 후에야 생기므로 srcObject 연결 시점을 openvidu에 맡긴다.
      media.streamManager.addVideoElement(videoRef.current);
    }
  }, [media.streamManager]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      aria-label={`${nickname} 캠 화면`}
      className="absolute inset-0 size-full object-cover"
    />
  );
}

// 캠 타일. 스트림이 없거나 상대가 캠을 끄면 프로필/플레이스홀더를 보여준다.
// 타일 폭은 항상 3열 기준(1/3)으로 고정해 참가자 수가 줄어도 비율이 유지된다.
function ParticipantVideoTile({
  participant,
  isSelf,
  isHost,
  localStream,
  media,
  camOn,
}: {
  participant: RoomParticipant;
  isSelf: boolean;
  isHost: boolean;
  localStream: MediaStream | null;
  media: RemoteMedia | undefined;
  camOn: boolean;
}) {
  const showLocalVideo = isSelf && camOn && localStream !== null;
  const showRemoteVideo = !isSelf && media !== undefined && media.videoActive;
  const showPlaceholder = !showLocalVideo && !showRemoteVideo;

  return (
    <div
      className={
        isSelf
          ? 'relative z-20 flex w-[calc((100%-2rem)/3)] min-w-0 flex-col border border-white/10 bg-[#1c1c1f] p-2'
          : 'flex w-[calc((100%-2rem)/3)] min-w-0 flex-col border border-white/10 bg-[#1c1c1f] p-2'
      }
    >
      <div className="relative grid aspect-video place-items-center overflow-visible border border-white/5 bg-[#242428]">
        {showLocalVideo ? <LocalVideo stream={localStream} nickname={participant.nickname} /> : null}
        {showRemoteVideo ? <RemoteVideo media={media} nickname={participant.nickname} /> : null}
        {showPlaceholder ? (
          <ProfilePlaceholder
            nickname={participant.nickname}
            profileImageUrl={participant.profileImageUrl}
          />
        ) : null}
        {isSelf ? <MyCardDock placement="tile" /> : null}
        <div className="absolute bottom-1.5 left-1.5 z-10 max-w-[calc(100%-0.75rem)]">
          <StageIdentityBadge
            size="sm"
            identity={{
              nickname: participant.nickname,
              isHost,
              isMe: isSelf,
              isPerformer: participant.stageRole === 'PERFORMER',
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface ParticipantVideoStripProps {
  currentUserId: number;
  participants: RoomParticipant[];
}

/**
 * 무대 아래 참가자 캠 스트립. 메인 무대에 나온 사람만 뺀다 —
 * 공연 중에는 가창자(무대=가창자 캠), 그 외에는 나(무대=내 캠).
 */
export function ParticipantVideoStrip({ currentUserId, participants }: ParticipantVideoStripProps) {
  const { localStream, remoteStreams } = useOpenViduSessionContext();
  const camOn = useStageStore((state) => state.camOn);
  const phase = useStageStore((state) => state.phase);
  const hostParticipantId = useRoomStore((state) => state.hostParticipantId);

  const visibleParticipants = participants.filter((participant) => {
    if (participant.connectionStatus === 'LEFT' || participant.connectionStatus === 'KICKED') {
      return false;
    }
    return phase === 'PERFORMING'
      ? participant.stageRole !== 'PERFORMER'
      : participant.userId !== currentUserId;
  });

  // 혼자 있는 방(대기 중)은 보여줄 타일이 없다 — 빈 줄을 남기지 않는다.
  if (visibleParticipants.length === 0) {
    return null;
  }

  return (
    <div className="flex justify-center gap-3 overflow-visible py-1" aria-label="참가자 캠 화면">
      {visibleParticipants.map((participant) => {
        const isSelf = participant.userId === currentUserId;

        return (
          <ParticipantVideoTile
            key={participant.id}
            participant={participant}
            isSelf={isSelf}
            isHost={participant.id === hostParticipantId}
            localStream={localStream}
            media={remoteStreams.get(participant.id)}
            camOn={camOn}
          />
        );
      })}
    </div>
  );
}
