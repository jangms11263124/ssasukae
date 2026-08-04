'use client';

import { useEffect, useRef } from 'react';

import { HoloMiniCard } from '@/entities/card';
import type { RoomParticipant } from '@/entities/participant';
import { cn } from '@/shared/lib/cn';

import { useCardStore, type ParticipantCardState } from '../../model/cardStore';
import { useOpenViduSessionContext } from '../../model/OpenViduSessionContext';
import { useStageStore } from '../../model/stageStore';
import type { RemoteMedia } from '../../model/useOpenViduSession';

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

// 캠이 꺼져도 오디오는 이 <video>가 재생하므로 언마운트하지 않고 숨기기만 한다.
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
      aria-label={`${nickname} 캠 화면`}
      className={cn(
        'absolute inset-0 size-full object-cover',
        !media.videoActive && 'invisible',
      )}
    />
  );
}

// 캠 타일. 스트림이 없거나 상대가 캠을 끄면 프로필/플레이스홀더를 보여준다.
// 타일 폭은 항상 3열 기준(1/3)으로 고정해 참가자 수가 줄어도 비율이 유지된다.
function ParticipantVideoTile({
  participant,
  isSelf,
  localStream,
  media,
  camOn,
  cardState,
}: {
  participant: RoomParticipant;
  isSelf: boolean;
  localStream: MediaStream | null;
  media: RemoteMedia | undefined;
  camOn: boolean;
  cardState: ParticipantCardState | undefined;
}) {
  const showLocalVideo = isSelf && camOn && localStream !== null;
  const showRemoteVideo = !isSelf && media !== undefined && media.videoActive;
  const keepRemoteAudioElement = !isSelf && media !== undefined;
  const showPlaceholder = !showLocalVideo && !showRemoteVideo;

  return (
    <div className="flex w-[calc((100%-2rem)/3)] min-w-0 flex-col">
      <div className="flex flex-col border border-white/10 bg-[#1c1c1f] p-2">
        <div className="relative grid aspect-video place-items-center border border-white/5 bg-[#242428]">
          {showLocalVideo ? (
            <LocalVideo stream={localStream} nickname={participant.nickname} />
          ) : null}
          {keepRemoteAudioElement ? (
            <RemoteVideo media={media} nickname={participant.nickname} />
          ) : null}
          {showPlaceholder ? (
            <ProfilePlaceholder
              nickname={participant.nickname}
              profileImageUrl={participant.profileImageUrl}
            />
          ) : null}
        </div>
        <p className="truncate pt-1.5 text-xs text-zinc-300">
          {participant.nickname}
          {isSelf ? ' (나)' : ''}
        </p>
      </div>
      {cardState !== undefined ? (
        <div className="flex justify-center pt-2" aria-label="공격 카드 보유 상태">
          <HoloMiniCard used={cardState === 'USED'} />
        </div>
      ) : null}
    </div>
  );
}

interface ParticipantVideoGridProps {
  currentUserId: number;
  participants: RoomParticipant[];
}

export function ParticipantVideoGrid({ currentUserId, participants }: ParticipantVideoGridProps) {
  const { localStream, remoteStreams } = useOpenViduSessionContext();
  const camOn = useStageStore((state) => state.camOn);
  const cardHolders = useCardStore((state) => state.cardHolders);
  const activeParticipants = participants.filter(
    ({ connectionStatus }) => connectionStatus !== 'LEFT' && connectionStatus !== 'KICKED',
  );

  return (
    <div className="flex justify-center gap-4" aria-label="참가자 캠 화면">
      {activeParticipants.map((participant) => {
        const isSelf = participant.userId === currentUserId;

        return (
          <ParticipantVideoTile
            key={participant.id}
            participant={participant}
            isSelf={isSelf}
            localStream={localStream}
            media={remoteStreams.get(participant.id)}
            camOn={camOn}
            cardState={cardHolders[participant.id]}
          />
        );
      })}
    </div>
  );
}
