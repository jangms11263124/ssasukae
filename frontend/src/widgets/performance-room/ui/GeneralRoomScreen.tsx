'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import type { RoomParticipant } from '@/entities/participant';
import {
  getRoomSnapshot,
  leaveRoom as requestLeaveRoom,
  terminateRoom,
  useRoomStore,
} from '@/entities/room';
import { useAuth } from '@/entities/user';
import { ApiError } from '@/shared/api/client';
import { showToast } from '@/shared/model/toastStore';

import { OpenViduSessionProvider } from '../model/OpenViduSessionContext';
import { RoomSocketProvider } from '../model/RoomSocketContext';
import { StageAudioProvider } from '../model/StageAudioContext';
import { useCardEffectSideEffects } from '../model/useCardEffectSideEffects';
import { useOpenViduSession } from '../model/useOpenViduSession';
import { useRoomSocket } from '../model/useRoomSocket';
import { useStageStore } from '../model/stageStore';
import { AudioEnginePanel } from './audio-engine/AudioEnginePanel';
import { ActiveEffectPanel } from './cards/ActiveEffectPanel';
import { MyCardDock } from './cards/MyCardDock';
import { CenterStage } from './center-stage/CenterStage';
import { RoomHelpFloatingButton } from './help/RoomHelpFloatingButton';
import { MediaControlDock } from './media-controls/MediaControlDock';
import { NowPlayingCard } from './now-playing/NowPlayingCard';
import { ParticipantVideoStrip } from './participant-video/ParticipantVideoStrip';
import { RemoteAudioSink } from './participant-video/RemoteAudioSink';
import { RoomLeftSection } from './RoomLeftSection';
import { StageControlPanel } from './stage-control/StageControlPanel';
import { TalkPanel } from './talk/TalkPanel';

export function GeneralRoomScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const session = useRoomStore((state) => state.session);
  const participants = useRoomStore((state) => state.participants);
  const hostParticipantId = useRoomStore((state) => state.hostParticipantId);
  const leaderboard = useRoomStore((state) => state.leaderboard);
  const leaveRoomStore = useRoomStore((state) => state.leaveRoom);
  const hydrateFromSnapshot = useRoomStore((state) => state.hydrateFromSnapshot);

  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const endStage = useStageStore((state) => state.endStage);

  const socket = useRoomSocket(session?.roomId ?? null);
  const media = useOpenViduSession();

  // 수성전 MIC_OPEN 카드: 내가 대상이면 효과 시간 동안 마이크를 강제 개방한다.
  useCardEffectSideEffects(session?.myParticipantId ?? null);

  // 방 세션 없이 직접 URL로 접근(새로고침 포함)하면 홈으로 돌려보낸다.
  // 방 정보 조회 응답에 초대 코드·OpenVidu 토큰이 없어 세션 전체는 복구할 수 없다.
  // 강퇴·방 종료로 세션이 비워진 경우는 소켓 핸들러가 이미 안내했으므로 조용히 이동만 한다.
  const hadSessionRef = useRef(session !== null);
  useEffect(() => {
    if (session !== null) {
      hadSessionRef.current = true;
      return;
    }
    if (!hadSessionRef.current) {
      showToast('방 정보가 없습니다. 다시 입장해 주세요.', 'error');
    }
    router.replace('/lobby');
  }, [session, router]);

  // 입장 시 방 정보를 조회해 기존 참가자 목록·방장·방 메타를 서버 기준으로 맞춘다.
  // 입장 응답에는 먼저 들어와 있던 참가자들이 없어 이 동기화가 필요하다.
  const roomId = session?.roomId ?? null;
  useEffect(() => {
    if (roomId === null) {
      return;
    }

    let cancelled = false;

    getRoomSnapshot(roomId)
      .then((snapshot) => {
        if (!cancelled) {
          // 무대·카드 복원은 구독을 연 뒤 조회하는 useRoomSocket이 담당한다. 여기서 또 반영하면
          // 구독 이전에 찍힌 스냅샷으로 덮어써 재접속 복원이 한 박자 뒤로 밀릴 수 있다.
          hydrateFromSnapshot(snapshot);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        // 방이 없거나(404) 내가 활성 참가자가 아니면(404·409) 방에 있을 수 없다.
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
          showToast(error.message, 'error');
          useRoomStore.getState().leaveRoom();
          router.replace('/lobby');
          return;
        }

        const message =
          error instanceof ApiError ? error.message : '방 정보를 불러오지 못했습니다.';
        showToast(message, 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [roomId, hydrateFromSnapshot, router]);

  if (session === null) {
    return null;
  }

  const currentUserId = user?.id ?? 0;
  const canManageParticipants = session.isHost;
  const isPerformer = session.myParticipantId === performerParticipantId;

  const stagedParticipants = participants.map((participant) => ({
    ...participant,
    stageRole:
      participant.id === performerParticipantId ? ('PERFORMER' as const) : ('PARTICIPANT' as const),
  }));

  const room = {
    id: session.roomId,
    inviteCode: session.inviteCode,
    maxParticipants: session.maxParticipants,
    mode: session.mode,
    name: session.name || `ROOM #${session.roomId}`,
  };

  const handleCopyInviteCode = async () => {
    await navigator.clipboard.writeText(session.inviteCode);
  };

  const handleDelegateHost = (participant: RoomParticipant) => {
    socket.sendHostChange(participant.id);
  };

  const handleKickParticipant = (participant: RoomParticipant) => {
    socket.sendKick(participant.id);
  };

  const handleLeaveRoom = async () => {
    try {
      // 방장은 방을 종료하고, 일반 참가자는 본인만 퇴장한다.
      if (session.isHost) {
        await terminateRoom(session.roomId);
      } else {
        await requestLeaveRoom(session.roomId);
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '방 나가기에 실패했습니다.';
      showToast(message, 'error');
    } finally {
      endStage();
      leaveRoomStore();
      router.push('/lobby');
    }
  };

  return (
    <RoomSocketProvider value={socket}>
      <OpenViduSessionProvider value={media}>
        <StageAudioProvider isPerformer={isPerformer}>
          <div className="min-h-dvh bg-[#0b0b0d] text-zinc-100">
            <main className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-[1500px] grid-cols-1 gap-4 px-6 py-12 lg:grid-cols-[270px_minmax(0,1fr)_300px]">
              <RoomLeftSection
                className="h-[calc(100dvh-6rem)] min-h-[720px]"
                room={room}
                participants={stagedParticipants}
                currentUserId={currentUserId}
                hostParticipantId={hostParticipantId ?? -1}
                leaderboard={leaderboard}
                canManageParticipants={canManageParticipants}
                onCopyInviteCode={handleCopyInviteCode}
                onDelegateHost={handleDelegateHost}
                onKickParticipant={handleKickParticipant}
                onLeaveRoom={handleLeaveRoom}
              />

              <section className="flex min-w-0 flex-col gap-4" aria-label="중앙 공연 영역">
                <CenterStage currentParticipantId={session.myParticipantId} />

                <ParticipantVideoStrip
                  currentUserId={currentUserId}
                  participants={stagedParticipants}
                />
                <MediaControlDock />
                <MyCardDock />
              </section>

              <section className="flex flex-col gap-4" aria-label="우측 제어 영역">
                <NowPlayingCard />
                <ActiveEffectPanel />
                <StageControlPanel />
                <AudioEnginePanel />
                <div className="min-h-0 flex-1">
                  <TalkPanel />
                </div>
              </section>
            </main>

            {/* 캠 그리드가 없어도 원격 참가자 음성은 계속 들려야 한다 */}
            <RemoteAudioSink />

            <footer className="flex h-12 items-center justify-between border-t border-white/10 bg-[#151517] px-6 font-mono text-[9px] tracking-wide text-zinc-500">
              <span>
                [ROOM_SYSTEM] ROOM_{session.roomId} ::{' '}
                {socket.isConnected ? 'WS_CONNECTED' : 'WS_CONNECTING...'}
                {socket.isConnected && socket.latencyMs !== null
                  ? ` :: PING ${socket.latencyMs}MS`
                  : ''}
              </span>
              <span>INVITE_CODE: {session.inviteCode}</span>
            </footer>

            <RoomHelpFloatingButton />
          </div>
        </StageAudioProvider>
      </OpenViduSessionProvider>
    </RoomSocketProvider>
  );
}
