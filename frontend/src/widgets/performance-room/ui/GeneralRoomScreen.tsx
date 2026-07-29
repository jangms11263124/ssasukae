'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { getRoomSnapshot, terminateRoom, useRoomStore } from '@/entities/room';
import { useAuth } from '@/entities/user';
import { ApiError } from '@/shared/api/client';
import { showToast } from '@/shared/model/toastStore';
import { AuthenticatedHeader } from '@/widgets/authenticated-header';

import { RoomSocketProvider } from '../model/RoomSocketContext';
import { useRoomSocket } from '../model/useRoomSocket';
import { useStageStore } from '../model/stageStore';
import { AudioEnginePanel } from './audio-engine/AudioEnginePanel';
import { CenterStage } from './center-stage/CenterStage';
import { MediaControlDock } from './media-controls/MediaControlDock';
import { NowPlayingCard } from './now-playing/NowPlayingCard';
import { ParticipantVideoGrid } from './participant-video/ParticipantVideoGrid';
import { RoomLeftSection } from './RoomLeftSection';
import { TalkPanel } from './talk/TalkPanel';

export function GeneralRoomScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const session = useRoomStore((state) => state.session);
  const participants = useRoomStore((state) => state.participants);
  const hostParticipantId = useRoomStore((state) => state.hostParticipantId);
  const leaveRoomStore = useRoomStore((state) => state.leaveRoom);
  const hydrateFromSnapshot = useRoomStore((state) => state.hydrateFromSnapshot);

  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const endStage = useStageStore((state) => state.endStage);

  const socket = useRoomSocket(session?.roomId ?? null);

  // 방 세션 없이 직접 URL로 접근(새로고침 포함)하면 홈으로 돌려보낸다.
  // 방 정보 조회 응답에 초대 코드·OpenVidu 토큰이 없어 세션 전체는 복구할 수 없다.
  useEffect(() => {
    if (session === null) {
      showToast('방 정보가 없습니다. 다시 입장해 주세요.', 'error');
      router.replace('/loby');
    }
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
          router.replace('/loby');
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

  // 방장 위임·강퇴는 WebSocket SEND 명세가 백엔드 미완성이라 아직 연동 대상이 아니다.
  const handleDelegateHost = () => {
    showToast('방장 위임 기능은 준비 중입니다.', 'info');
  };

  const handleKickParticipant = () => {
    showToast('강제 퇴장 기능은 준비 중입니다.', 'info');
  };

  const handleLeaveRoom = async () => {
    try {
      // 방장은 방 종료 API를 호출한다. 참가자 퇴장 SEND는 백엔드 미완성이라 로컬 정리만 한다.
      if (session.isHost) {
        await terminateRoom(session.roomId);
      }
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : '방 종료에 실패했습니다.';
      showToast(message, 'error');
    } finally {
      endStage();
      leaveRoomStore();
      router.push('/loby');
    }
  };

  return (
    <RoomSocketProvider value={socket}>
      <div className="min-h-dvh bg-[#0b0b0d] text-zinc-100">
        <AuthenticatedHeader />

        <main className="mx-auto grid min-h-[calc(100dvh-8rem)] max-w-[1500px] grid-cols-1 gap-4 px-6 py-12 lg:grid-cols-[270px_minmax(0,1fr)_300px]">
          <RoomLeftSection
            className="h-[calc(100dvh-11rem)] min-h-[720px]"
            room={room}
            participants={stagedParticipants}
            currentUserId={currentUserId}
            hostParticipantId={hostParticipantId ?? -1}
            leaderboard={[]}
            canManageParticipants={canManageParticipants}
            onCopyInviteCode={handleCopyInviteCode}
            onDelegateHost={handleDelegateHost}
            onKickParticipant={handleKickParticipant}
            onLeaveRoom={handleLeaveRoom}
          />

          <section className="flex min-w-0 flex-col gap-4" aria-label="중앙 공연 영역">
            <CenterStage
              currentParticipantId={session.myParticipantId}
              isHost={canManageParticipants}
              participants={stagedParticipants}
            />

            <ParticipantVideoGrid currentUserId={currentUserId} participants={stagedParticipants} />
            <MediaControlDock />
          </section>

          <section className="flex flex-col gap-4" aria-label="우측 제어 영역">
            <NowPlayingCard />
            <AudioEnginePanel />
            <div className="min-h-0 flex-1">
              <TalkPanel />
            </div>
          </section>
        </main>

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
      </div>
    </RoomSocketProvider>
  );
}
