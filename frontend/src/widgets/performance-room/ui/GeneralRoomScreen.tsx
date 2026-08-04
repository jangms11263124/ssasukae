'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { RoomParticipant } from '@/entities/participant';
import {
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
import { useRoomBootstrap } from '../model/useRoomBootstrap';
import { useRoomSocket } from '../model/useRoomSocket';
import { useStageStore } from '../model/stageStore';
import { MyCardDock } from './cards/MyCardDock';
import { CenterStage } from './center-stage/CenterStage';
import { RoomHelpFloatingButton } from './help/RoomHelpFloatingButton';
import { LeaderboardPanel } from './LeaderboardPanel';
import {
  RoomParticipantsMobile,
  RoomRightSidebar,
  useRoomAuxPanels,
} from './layout/RoomSidePanels';
import { AudioEnginePanel } from './audio-engine/AudioEnginePanel';
import { ParticipantList } from './ParticipantList';
import { ParticipantVideoStrip } from './participant-video/ParticipantVideoStrip';
import { RemoteAudioSink } from './participant-video/RemoteAudioSink';
import { RoomTopBar } from './RoomTopBar';

interface GeneralRoomScreenProps {
  roomIdFromUrl: number | null;
}

function RoomBootstrapLoading() {
  return (
    <div className="flex h-dvh items-center justify-center bg-[#0b0b0d] text-zinc-400">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-cyan-300" />
        <p className="text-sm">방 정보를 불러오는 중...</p>
      </div>
    </div>
  );
}

/** session 복구가 끝난 뒤에만 마운트 — OpenVidu·소켓 이중 연결을 막는다 */
function GeneralRoomContent() {
  const router = useRouter();
  const { user } = useAuth();

  const session = useRoomStore((state) => state.session);
  const participants = useRoomStore((state) => state.participants);
  const hostParticipantId = useRoomStore((state) => state.hostParticipantId);
  const leaderboard = useRoomStore((state) => state.leaderboard);
  const leaveRoomStore = useRoomStore((state) => state.leaveRoom);

  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const phase = useStageStore((state) => state.phase);
  const endStage = useStageStore((state) => state.endStage);

  const socket = useRoomSocket(session?.roomId ?? null);
  const media = useOpenViduSession();

  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardPhase, setLeaderboardPhase] = useState(phase);
  const {
    participantsOpen,
    setParticipantsOpen,
    audioOpen,
    setAudioOpen,
  } = useRoomAuxPanels();

  if (phase !== leaderboardPhase) {
    setLeaderboardPhase(phase);
    if (phase === 'SCORE') {
      setLeaderboardOpen(true);
    }
  }

  useCardEffectSideEffects(session?.myParticipantId ?? null);

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
          <div className="flex h-dvh flex-col overflow-y-auto bg-[#0b0b0d] text-zinc-100 lg:overflow-y-hidden">
            <RoomTopBar
              room={room}
              activeParticipantCount={participants.length}
              maxParticipants={session.maxParticipants}
              participantsOpen={participantsOpen}
              audioOpen={audioOpen}
              showAudioToggle={isPerformer}
              leaderboardOpen={leaderboardOpen}
              onCopyInviteCode={handleCopyInviteCode}
              onToggleParticipants={() => setParticipantsOpen((prev) => !prev)}
              onParticipantsClose={() => setParticipantsOpen(false)}
              onToggleAudio={() => setAudioOpen((prev) => !prev)}
              onAudioClose={() => setAudioOpen(false)}
              onToggleLeaderboard={() => setLeaderboardOpen((prev) => !prev)}
              onLeaderboardClose={() => setLeaderboardOpen(false)}
              onLeaveRoom={handleLeaveRoom}
              participantsPanel={
                <ParticipantList
                  compact
                  hideHeader
                  participants={stagedParticipants}
                  currentUserId={currentUserId}
                  hostParticipantId={hostParticipantId ?? -1}
                  maxParticipants={session.maxParticipants}
                  canManageParticipants={canManageParticipants}
                  onDelegateHost={handleDelegateHost}
                  onKickParticipant={handleKickParticipant}
                />
              }
              audioPanel={<AudioEnginePanel variant="dock" />}
              leaderboardPanel={<LeaderboardPanel entries={leaderboard} compact />}
            />

            <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 px-4 py-3 lg:flex-row lg:overflow-y-hidden">
              <section
                className="flex min-h-[50dvh] min-w-0 flex-1 flex-col gap-2 lg:min-h-0"
                aria-label="중앙 공연 영역"
              >
                <RoomParticipantsMobile
                  participants={stagedParticipants}
                  currentUserId={currentUserId}
                  hostParticipantId={hostParticipantId ?? -1}
                  maxParticipants={session.maxParticipants}
                  canManageParticipants={canManageParticipants}
                  onDelegateHost={handleDelegateHost}
                  onKickParticipant={handleKickParticipant}
                />

                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <CenterStage currentParticipantId={session.myParticipantId} />
                </div>

                <div className="shrink-0">
                  <ParticipantVideoStrip
                    currentUserId={currentUserId}
                    participants={stagedParticipants}
                  />
                </div>

                <div className="shrink-0">
                  <MyCardDock />
                </div>
              </section>

              <RoomRightSidebar />
            </main>

            <RemoteAudioSink />

            <footer className="flex h-9 shrink-0 items-center justify-between border-t border-white/10 bg-[#151517] px-5 font-mono text-[9px] tracking-wide text-zinc-500">
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

export function GeneralRoomScreen({ roomIdFromUrl }: GeneralRoomScreenProps) {
  const bootstrap = useRoomBootstrap(roomIdFromUrl);
  const session = useRoomStore((state) => state.session);

  if (bootstrap === 'pending') {
    return <RoomBootstrapLoading />;
  }

  if (session === null) {
    return null;
  }

  return <GeneralRoomContent />;
}
