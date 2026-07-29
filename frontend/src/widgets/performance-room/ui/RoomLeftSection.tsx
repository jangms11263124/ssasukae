'use client';

import type { LeaderboardEntry } from '@/entities/performance';
import type { RoomParticipant } from '@/entities/participant';
import type { RoomSummary } from '@/entities/room';
import { cn } from '@/shared/lib/cn';

import { LeaderboardPanel } from './LeaderboardPanel';
import { LeaveRoomButton } from './LeaveRoomButton';
import { ParticipantList } from './ParticipantList';
import { RoomInfoCard } from './RoomInfoCard';

interface RoomLeftSectionProps {
  canManageParticipants: boolean;
  className?: string;
  currentUserId: number;
  hostParticipantId: number;
  leaderboard: LeaderboardEntry[];
  onCopyInviteCode: () => void;
  onDelegateHost: (participant: RoomParticipant) => void;
  onKickParticipant: (participant: RoomParticipant) => void;
  onLeaveRoom: () => void;
  participants: RoomParticipant[];
  room: RoomSummary;
}

export function RoomLeftSection({
  canManageParticipants,
  className,
  currentUserId,
  hostParticipantId,
  leaderboard,
  onCopyInviteCode,
  onDelegateHost,
  onKickParticipant,
  onLeaveRoom,
  participants,
  room,
}: RoomLeftSectionProps) {
  return (
    <aside
      aria-label="공연방 정보"
      className={cn('flex min-h-0 w-full flex-col gap-4', className)}
    >
      <RoomInfoCard room={room} onCopyInviteCode={onCopyInviteCode} />
      <ParticipantList
        participants={participants}
        currentUserId={currentUserId}
        hostParticipantId={hostParticipantId}
        maxParticipants={room.maxParticipants}
        canManageParticipants={canManageParticipants}
        onDelegateHost={onDelegateHost}
        onKickParticipant={onKickParticipant}
      />
      <LeaderboardPanel entries={leaderboard} />
      <LeaveRoomButton onLeaveRoom={onLeaveRoom} />
    </aside>
  );
}
