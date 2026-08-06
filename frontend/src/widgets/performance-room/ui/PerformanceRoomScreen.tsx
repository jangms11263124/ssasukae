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
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { showToast } from '@/shared/model/toastStore';
import { ConfirmDialog } from '@/shared/ui/dialog/ConfirmDialog';

import { OpenViduSessionProvider } from '../model/OpenViduSessionContext';
import { RoomSocketProvider } from '../model/RoomSocketContext';
import { StageAudioProvider } from '../model/StageAudioContext';
import { useCardEffectSideEffects } from '../model/useCardEffectSideEffects';
import { useLeaveRoomOnBack } from '../model/useLeaveRoomOnBack';
import { useOpenViduSession } from '../model/useOpenViduSession';
import { useRoomBootstrap } from '../model/useRoomBootstrap';
import { useRoomSocket } from '../model/useRoomSocket';
import { useStageStore } from '../model/stageStore';
import { CardDealOverlay } from './cards/CardDealOverlay';
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

interface PerformanceRoomScreenProps {
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
function PerformanceRoomContent() {
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
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
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
  // 뒤로가기도 나가기 버튼과 같은 확인을 거친다 — 서버에 유령 참가자를 남기지 않는다.
  useLeaveRoomOnBack(() => setLeaveConfirmOpen(true));

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
    setIsLeaving(true);
    try {
      if (session.isHost) {
        await terminateRoom(session.roomId);
      } else {
        await requestLeaveRoom(session.roomId);
      }
    } catch (error) {
      showToast(getApiErrorMessage(error, '방에서 나가지 못했어요.'), 'error');
    } finally {
      endStage();
      leaveRoomStore();
      // 뒤로가기 가드로 쌓아 둔 항목이 남아 있어, push로 나가면 다시 뒤로가기했을 때
      // 세션 없는 방 화면으로 돌아간다. 떠난 방은 히스토리에 남기지 않는다.
      router.replace('/lobby');
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
              onLeaveRoom={() => setLeaveConfirmOpen(true)}
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

            <ConfirmDialog
              open={leaveConfirmOpen}
              title="방에서 나가시겠어요?"
              description={
                session.isHost ? (
                  <>
                    방장이 나가면 방이 종료되고,
                    <br />
                    모든 참가자가 함께 나가요.
                  </>
                ) : (
                  '나가면 로비로 이동해요.'
                )
              }
              confirmLabel="나가기"
              danger
              pending={isLeaving}
              onConfirm={handleLeaveRoom}
              onCancel={() => setLeaveConfirmOpen(false)}
            />

            {/* 스테이지가 아니라 브라우저 전체 기준 배분 연출 */}
            <CardDealOverlay />
          </div>
        </StageAudioProvider>
      </OpenViduSessionProvider>
    </RoomSocketProvider>
  );
}

export function PerformanceRoomScreen({ roomIdFromUrl }: PerformanceRoomScreenProps) {
  const bootstrap = useRoomBootstrap(roomIdFromUrl);
  const session = useRoomStore((state) => state.session);

  if (bootstrap === 'pending') {
    return <RoomBootstrapLoading />;
  }

  if (session === null) {
    return null;
  }

  return <PerformanceRoomContent />;
}
