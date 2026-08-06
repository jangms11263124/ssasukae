'use client';

import { useState } from 'react';

import { HoloMiniCard } from '@/entities/card';
import type { RoomParticipant } from '@/entities/participant';
import { cn } from '@/shared/lib/cn';

import { useCardStore } from '../model/cardStore';
import {
  ParticipantActionConfirmDialog,
  type ParticipantActionType,
} from './ParticipantActionConfirmDialog';
import { ParticipantActionMenu } from './ParticipantActionMenu';
import { ParticipantAvatar } from './ParticipantAvatar';
import { RoomPanel } from './RoomPanel';

interface ParticipantListProps {
  canManageParticipants: boolean;
  compact?: boolean;
  currentUserId: number;
  hideHeader?: boolean;
  hostParticipantId: number;
  maxParticipants: number;
  onDelegateHost: (participant: RoomParticipant) => void;
  onKickParticipant: (participant: RoomParticipant) => void;
  participants: RoomParticipant[];
}

function CrownIcon() {
  return (
    <svg
      role="img"
      aria-label="방장"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0 text-amber-300 drop-shadow-[0_0_4px_rgba(252,211,77,0.45)]"
    >
      <path d="M4 8l4 3.5L12 6l4 5.5L20 8l-1.6 9.5H5.6L4 8z" />
    </svg>
  );
}

interface PendingAction {
  participant: RoomParticipant;
  type: ParticipantActionType;
}

export function ParticipantList({
  canManageParticipants,
  compact = false,
  currentUserId,
  hideHeader = false,
  hostParticipantId,
  maxParticipants,
  onDelegateHost,
  onKickParticipant,
  participants,
}: ParticipantListProps) {
  const [openMenuParticipantId, setOpenMenuParticipantId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  // 수성전 공격 카드 보유 상태. 참가자 캠 그리드가 사라져 리스트에서 배지로 보여준다.
  const cardHolders = useCardStore((state) => state.cardHolders);

  const activeParticipants = participants.filter(
    ({ connectionStatus }) => connectionStatus !== 'LEFT' && connectionStatus !== 'KICKED',
  );

  const openPendingAction = (type: ParticipantActionType, participant: RoomParticipant) => {
    setPendingAction({ participant, type });
    setOpenMenuParticipantId(null);
  };

  const handleConfirmAction = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'delegate') {
      onDelegateHost(pendingAction.participant);
    } else {
      onKickParticipant(pendingAction.participant);
    }
    setPendingAction(null);
  };

  return (
    <RoomPanel
      className={cn(
        'flex flex-col overflow-hidden',
        compact ? 'h-auto border-0 bg-transparent px-3 py-2 shadow-none' : 'h-full min-h-0 px-4 py-3',
      )}
    >
      <h2
        className={cn(
          'shrink-0 border-b border-white/15 pb-2 text-sm font-medium text-zinc-200',
          hideHeader && 'sr-only',
        )}
      >
        참가자 [{activeParticipants.length}/{maxParticipants}]
      </h2>

      <ul
        className={cn(
          compact ? 'space-y-0.5' : 'mt-2 space-y-1',
          !compact &&
            'min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
        )}
        aria-label="참가자 목록"
      >
        {activeParticipants.map((participant) => {
          const isCurrentUser = participant.userId === currentUserId;
          const isConnected = participant.connectionStatus === 'CONNECTED';
          const isPerformer = participant.stageRole === 'PERFORMER';
          const isRoomHost = participant.id === hostParticipantId;
          const canManageThisParticipant =
            canManageParticipants && !isCurrentUser && isConnected;
          const cardState = cardHolders[participant.id];

          return (
            <li
              key={participant.id}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 text-sm',
                compact ? 'min-h-9' : 'min-h-10 px-2.5 py-2',
                isCurrentUser ? 'text-fuchsia-400' : 'text-zinc-300',
                !isConnected && 'opacity-45',
              )}
            >
              {isRoomHost ? (
                <CrownIcon />
              ) : (
                <span
                  aria-label={isConnected ? '접속 중' : '연결 끊김'}
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    isConnected
                      ? 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.6)]'
                      : 'bg-zinc-600',
                  )}
                />
              )}
              <ParticipantAvatar
                className="size-7"
                nickname={participant.nickname}
                profileImageUrl={participant.profileImageUrl}
              />
              <span className="min-w-0 flex-1 truncate">
                {participant.nickname}
                {isCurrentUser && ' (나)'}
              </span>
              {cardState !== undefined ? (
                // HoloMiniCard(40×56px)를 행 높이에 맞게 축소한다. cn이 클래스 병합을 안 해
                // 폭 클래스 덮어쓰기 대신 transform으로 줄인다.
                <span
                  aria-label={cardState === 'USED' ? '공격 카드 사용됨' : '공격 카드 보유'}
                  className="grid h-7 w-5 shrink-0 place-items-center"
                >
                  <HoloMiniCard used={cardState === 'USED'} className="scale-50" />
                </span>
              ) : null}
              {isPerformer && (
                <span className="font-mono text-[9px] tracking-widest text-cyan-300">LIVE</span>
              )}
              {canManageThisParticipant ? (
                <ParticipantActionMenu
                  isOpen={openMenuParticipantId === participant.id}
                  nickname={participant.nickname}
                  onToggle={() =>
                    setOpenMenuParticipantId((prev) =>
                      prev === participant.id ? null : participant.id,
                    )
                  }
                  onClose={() => setOpenMenuParticipantId(null)}
                  onDelegateHost={() => openPendingAction('delegate', participant)}
                  onKickParticipant={() => openPendingAction('kick', participant)}
                />
              ) : null}
            </li>
          );
        })}

        {Array.from({ length: Math.max(0, maxParticipants - activeParticipants.length) }, (_, index) => (
          <li
            key={`empty-${index}`}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-600',
              compact ? 'min-h-9' : 'min-h-10 px-2.5 py-2',
            )}
          >
            <span className="size-2 shrink-0 rounded-full bg-zinc-700" aria-hidden />
            <span className="size-7 shrink-0 rounded-full border border-dashed border-white/15 bg-white/[0.03]" />
            <span className="min-w-0 flex-1 truncate">빈 자리</span>
          </li>
        ))}
      </ul>

      {pendingAction ? (
        <ParticipantActionConfirmDialog
          action={pendingAction.type}
          nickname={pendingAction.participant.nickname}
          onCancel={() => setPendingAction(null)}
          onConfirm={handleConfirmAction}
        />
      ) : null}
    </RoomPanel>
  );
}
