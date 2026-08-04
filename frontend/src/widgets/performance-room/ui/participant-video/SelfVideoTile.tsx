'use client';

import { useEffect, useRef } from 'react';

import { useOpenViduSessionContext } from '../../model/OpenViduSessionContext';
import { useStageStore } from '../../model/stageStore';

interface SelfVideoTileProps {
  nickname: string;
}

/**
 * 공연 중 셀프 뷰. 무대가 가창자 캠으로 바뀌면 내 모습을 확인할 곳이 없어
 * 무대 아래에 내 캠만 작게 남긴다 — 가창자 본인은 무대가 곧 내 캠이라 띄우지 않는다.
 */
export function SelfVideoTile({ nickname }: SelfVideoTileProps) {
  const camOn = useStageStore((state) => state.camOn);
  const { localStream } = useOpenViduSessionContext();
  const videoRef = useRef<HTMLVideoElement>(null);

  const showVideo = camOn && localStream !== null;

  useEffect(() => {
    if (showVideo && videoRef.current !== null) {
      videoRef.current.srcObject = localStream;
    }
  }, [showVideo, localStream]);

  return (
    <div className="flex justify-center">
      <div className="w-52 border border-white/10 bg-[#1c1c1f] p-2">
        <div className="relative grid aspect-video place-items-center border border-white/5 bg-[#242428]">
          {showVideo ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label="내 캠 화면"
              className="absolute inset-0 size-full -scale-x-100 object-cover"
            />
          ) : (
            <p className="text-xs text-zinc-500">카메라가 꺼져 있습니다</p>
          )}
        </div>
        <p className="truncate pt-1.5 text-xs text-zinc-300">{nickname} (나)</p>
      </div>
    </div>
  );
}
