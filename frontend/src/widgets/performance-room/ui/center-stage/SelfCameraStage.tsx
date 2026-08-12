import { useRoomStore } from '@/entities/room';

import { useOpenViduSessionContext } from '../../model/OpenViduSessionContext';
import { useStageStore } from '../../model/stageStore';
import { MediaControlsOverlay } from './overlays/MediaControlsOverlay';
import { StageBackdrop } from './StageBackdrop';
import { StageCameraFeed } from './StageCameraFeed';
import { StageIdentityBadge } from './StageIdentityBadge';

/**
 * 공연 전(대기~준비) 단계의 무대. 진행 안내·버튼은 무대 상단 현재 곡 바가 맡고,
 * 무대는 내 캠만 비춘다 — 공연이 시작되면 PerformingStage가 가창자 캠으로 교체한다.
 */
export function SelfCameraStage() {
  const camOn = useStageStore((state) => state.camOn);
  const { localStream } = useOpenViduSessionContext();
  const myParticipantId = useRoomStore((state) => state.session?.myParticipantId);
  const hostParticipantId = useRoomStore((state) => state.hostParticipantId);
  const participants = useRoomStore((state) => state.participants);
  const me = participants.find((participant) => participant.id === myParticipantId);

  const cameraSource = camOn ? localStream : null;
  const placeholder =
    cameraSource !== null ? null : camOn ? '카메라를 준비하고 있습니다' : '카메라가 꺼져 있습니다';

  return (
    <StageBackdrop
      placeholder={placeholder}
      profileImageUrl={cameraSource === null ? (me?.profileImageUrl ?? null) : null}
    >
      {cameraSource !== null ? <StageCameraFeed source={cameraSource} mirrored /> : null}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-[min(calc(100%-2rem),16rem)]">
        <StageIdentityBadge
          identity={{
            nickname: me?.nickname ?? '나',
            isMe: true,
            isHost: myParticipantId !== undefined && myParticipantId === hostParticipantId,
          }}
        />
      </div>
      <MediaControlsOverlay />
    </StageBackdrop>
  );
}
