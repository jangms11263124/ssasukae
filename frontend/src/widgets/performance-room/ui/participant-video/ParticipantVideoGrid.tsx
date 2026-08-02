'use client';

import { useEffect, useRef } from 'react';

import type { RoomParticipant } from '@/entities/participant';
import { cn } from '@/shared/lib/cn';

import { useOpenViduSessionContext } from '../../model/OpenViduSessionContext';
import type { RemoteMedia } from '../../model/useOpenViduSession';

function PersonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="size-10 text-zinc-600"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="9.5" r="3" />
      <path d="M6.6 18.3c1.2-2.3 3.2-3.5 5.4-3.5s4.2 1.2 5.4 3.5" />
    </svg>
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

// 캠 타일. 스트림이 없거나 상대가 캠을 끄면 아바타 아이콘을 보여준다.
// 타일 폭은 항상 3열 기준(1/3)으로 고정해 참가자 수가 줄어도 비율이 유지된다.
function ParticipantVideoTile({
  participant,
  media,
}: {
  participant: RoomParticipant;
  media: RemoteMedia | undefined;
}) {
  return (
    <div className="flex w-[calc((100%-2rem)/3)] min-w-0 flex-col border border-white/10 bg-[#1c1c1f] p-2">
      <div className="relative grid aspect-video place-items-center border border-white/5 bg-[#242428]">
        {media !== undefined ? <RemoteVideo media={media} nickname={participant.nickname} /> : null}
        {media === undefined || !media.videoActive ? <PersonIcon /> : null}
      </div>
      <p className="truncate pt-1.5 text-xs text-zinc-300">{participant.nickname}</p>
    </div>
  );
}

interface ParticipantVideoGridProps {
  currentUserId: number;
  participants: RoomParticipant[];
}

export function ParticipantVideoGrid({ currentUserId, participants }: ParticipantVideoGridProps) {
  const { remoteStreams } = useOpenViduSessionContext();
  const others = participants.filter(({ userId }) => userId !== currentUserId);

  return (
    <div className="flex justify-center gap-4" aria-label="참가자 캠 화면">
      {others.map((participant) => (
        <ParticipantVideoTile
          key={participant.id}
          participant={participant}
          media={remoteStreams.get(participant.id)}
        />
      ))}
    </div>
  );
}
