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
import { RoomPanel } from './RoomPanel';

interface ParticipantListProps {
  canManageParticipants: boolean;
  currentUserId: number;
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
  currentUserId,
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
    <RoomPanel className="min-h-0 px-4 py-4">
      <h2 className="border-b border-white/15 pb-2 font-mono text-sm tracking-[0.08em] text-zinc-300">
        STAGE USERS[{activeParticipants.length}/{maxParticipants}]
      </h2>

      <ul className="mt-2 space-y-1" aria-label="참가자 목록">
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
                'flex min-h-10 items-center gap-2 px-2.5 py-2 text-sm',
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
              <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-white/10">
                {participant.profileImageUrl &&
                /^https?:\/\//.test(participant.profileImageUrl) ? (
                  <img
                    src={participant.profileImageUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="grid size-full place-items-center font-mono text-[10px] text-zinc-400">
                    {participant.nickname.trim().charAt(0) || '?'}
                  </span>
                )}
              </span>
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
