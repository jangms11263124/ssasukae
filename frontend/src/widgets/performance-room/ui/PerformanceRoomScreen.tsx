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

import { useLatencyStore } from '../model/latencyStore';
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
import { MyCardCorner } from './cards/MyCardCorner';
import { CenterStage } from './center-stage/CenterStage';
import { LeaderboardPanel } from './LeaderboardPanel';
import { ResizableCamRail } from './layout/ResizableCamRail';
import { RoomParticipantsMobile, useRoomAuxPanels } from './layout/RoomSidePanels';
import { AudioEnginePanel } from './audio-engine/AudioEnginePanel';
import { NowPlayingBar } from './now-playing/NowPlayingBar';
import { ParticipantList } from './ParticipantList';
import { ParticipantVideoStrip } from './participant-video/ParticipantVideoStrip';
import { RemoteAudioSink } from './participant-video/RemoteAudioSink';
import { RoomTopBar } from './RoomTopBar';
import { SingerSelectModalHost } from './stage-control/SingerSelectModalHost';
import { FloatingChatDock } from './talk/FloatingChatDock';

interface PerformanceRoomScreenProps {
  roomIdFromUrl: number | null;
}

/** 지연값은 10초마다 갱신되므로, 방 화면 전체가 아니라 이 스팬만 재렌더되게 분리한다 */
function PingReadout() {
  const latencyMs = useLatencyStore((state) => state.latencyMs);

  return (
    <span className="tabular-nums">PING: {latencyMs !== null ? `${latencyMs}MS` : '--'}</span>
  );
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

            {/* 모바일 하단 패딩(pb-20)은 스크롤 끝 콘텐츠가 플로팅 채팅 버튼(상단 5.75rem)에 안 가리게 한다 */}
            <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 px-4 pb-20 pt-3 lg:flex-row lg:overflow-y-hidden lg:pb-3">
              {/* 내 카드가 위, 참가자 캠이 아래. 스트립·카드가 모두 비면 레일 폭도 사라진다 */}
              <ResizableCamRail>
                <MyCardCorner />
                <ParticipantVideoStrip
                  currentUserId={currentUserId}
                  participants={stagedParticipants}
                />
              </ResizableCamRail>

              <section
                className="order-1 flex min-h-[50dvh] min-w-0 flex-1 flex-col gap-2 lg:order-2 lg:min-h-0"
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

                <NowPlayingBar />

                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <CenterStage currentParticipantId={session.myParticipantId} />
                </div>
              </section>

              {/* 데스크톱은 상단 바 팝오버로 열지만 모바일은 인라인로 둔다 (기존 사이드바 위치 대체) */}
              <div className="order-3 lg:hidden">
                <AudioEnginePanel variant="inline" />
              </div>
            </main>

            <RemoteAudioSink />

            <footer className="flex h-9 shrink-0 items-center justify-between border-t border-white/10 bg-[#151517] px-5 font-mono text-[9px] tracking-wide text-zinc-500">
              <span>
                [ROOM_SYSTEM] ROOM_{session.roomId} :{' '}
                {socket.isConnected ? 'WS_CONNECTED' : 'WS_CONNECTING...'}
              </span>
              <PingReadout />
            </footer>

            <FloatingChatDock />

            {phase === 'SINGER_SELECT' && session.isHost ? (
              <SingerSelectModalHost
                participants={stagedParticipants}
                currentParticipantId={session.myParticipantId}
                hostParticipantId={hostParticipantId ?? -1}
                maxParticipants={session.maxParticipants}
              />
            ) : null}

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
