'use client';

import { useState, type ReactNode } from 'react';

import type { RoomParticipant } from '@/entities/participant';
import { useRoomStore } from '@/entities/room';

import { participantsPanelDefaultOpen } from '../../model/roomPanelDefaults';
import { usePhaseSyncedPanelOpen } from '../../model/usePhaseSyncedPanelOpen';
import { useStageStore, type StagePhase } from '../../model/stageStore';
import { AudioEnginePanel } from '../audio-engine/AudioEnginePanel';
import { ActiveEffectPanel } from '../cards/ActiveEffectPanel';
import { NowPlayingCard } from '../now-playing/NowPlayingCard';
import { ParticipantList } from '../ParticipantList';
import { StageControlPanel } from '../stage-control/StageControlPanel';
import { TalkPanel } from '../talk/TalkPanel';

interface RoomPanelProps {
  canManageParticipants: boolean;
  currentUserId: number;
  hostParticipantId: number;
  maxParticipants: number;
  onDelegateHost: (participant: RoomParticipant) => void;
  onKickParticipant: (participant: RoomParticipant) => void;
  participants: RoomParticipant[];
}

function audioPanelDefaultOpen(phase: StagePhase, isPerformer: boolean): boolean {
  return isPerformer && (phase === 'PERFORMING' || phase === 'READY');
}

function MobileCollapsibleSection({
  children,
  open,
  onToggle,
  title,
}: {
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-[#141416] lg:hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-zinc-200">{title}</span>
        <span className="text-xs text-zinc-500" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? <div className="max-h-64 overflow-hidden border-t border-white/10">{children}</div> : null}
    </section>
  );
}

export function useRoomAuxPanels() {
  const phase = useStageStore((state) => state.phase);
  const myParticipantId = useRoomStore((state) => state.session?.myParticipantId);
  const performerParticipantId = useStageStore((state) => state.performerParticipantId);
  const isPerformer =
    myParticipantId !== undefined && myParticipantId === performerParticipantId;

  const { open: participantsOpen, setOpen: setParticipantsOpen } =
    usePhaseSyncedPanelOpen(participantsPanelDefaultOpen);

  const [audioOpen, setAudioOpen] = useState(() => audioPanelDefaultOpen(phase, isPerformer));
  const [audioSyncKey, setAudioSyncKey] = useState(`${phase}:${isPerformer}`);
  const currentAudioSyncKey = `${phase}:${isPerformer}`;

  if (currentAudioSyncKey !== audioSyncKey) {
    setAudioSyncKey(currentAudioSyncKey);
    setAudioOpen(audioPanelDefaultOpen(phase, isPerformer));
  }

  return {
    participantsOpen,
    setParticipantsOpen,
    audioOpen,
    setAudioOpen,
  };
}

export function RoomParticipantsMobile(props: RoomPanelProps) {
  const { open, toggle } = usePhaseSyncedPanelOpen(participantsPanelDefaultOpen);

  return (
    <MobileCollapsibleSection open={open} onToggle={toggle} title="참가자">
      <ParticipantList compact {...props} />
    </MobileCollapsibleSection>
  );
}

export function RoomRightSidebar() {
  return (
    <section
      aria-label="채팅 및 무대 진행"
      className="flex h-full min-h-[40dvh] w-full flex-col gap-2 overflow-hidden lg:w-[300px] lg:shrink-0"
    >
      <div
        className={
          'flex shrink-0 flex-col gap-2 overflow-y-auto ' +
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
        }
      >
        <NowPlayingCard />
        <ActiveEffectPanel />
        <StageControlPanel />
        <div className="lg:hidden">
          <AudioEnginePanel variant="inline" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <TalkPanel />
      </div>
    </section>
  );
}
