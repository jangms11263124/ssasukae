'use client';

import { useEffect, useRef, useState } from 'react';

import type { RoomSummary } from '@/entities/room';

import { RoomPanel } from './RoomPanel';

const ROOM_MODE_LABEL = {
  BATTLE: '수성전 모드',
  GENERAL: '일반 모드',
} satisfies Record<RoomSummary['mode'], string>;

const COPIED_MESSAGE_DURATION_MS = 2000;

interface RoomInfoCardProps {
  onCopyInviteCode: () => void | Promise<void>;
  room: RoomSummary;
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="size-4"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M8.5 8.5h8v10h-8z" />
      <path d="M6 15.5H4.5v-10h8V7" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="size-3.5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
    >
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    </svg>
  );
}

export function RoomInfoCard({ onCopyInviteCode, room }: RoomInfoCardProps) {
  const [isCopied, setIsCopied] = useState(false);
  const hideMessageTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (hideMessageTimerRef.current !== null) {
        window.clearTimeout(hideMessageTimerRef.current);
      }
    },
    [],
  );

  const handleCopyClick = async () => {
    await onCopyInviteCode();
    setIsCopied(true);

    if (hideMessageTimerRef.current !== null) {
      window.clearTimeout(hideMessageTimerRef.current);
    }
    hideMessageTimerRef.current = window.setTimeout(
      () => setIsCopied(false),
      COPIED_MESSAGE_DURATION_MS,
    );
  };

  return (
    <RoomPanel className="relative overflow-hidden px-4 py-4">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-px bg-cyan-300/70 shadow-[0_0_12px_rgba(103,232,249,0.75)]"
      />

      <div className="flex items-center justify-between gap-3 text-cyan-200">
        <h2 className="truncate text-sm font-semibold">{room.name}</h2>
        <SignalIcon />
      </div>

      <p className="mt-2 text-sm text-zinc-300">{ROOM_MODE_LABEL[room.mode]}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="font-mono text-sm tracking-[0.34em] text-zinc-500">
          {room.inviteCode}
        </span>
        <button
          type="button"
          onClick={handleCopyClick}
          aria-label={`초대 코드 ${room.inviteCode} 복사`}
          className="grid size-8 shrink-0 place-items-center text-zinc-400 transition-colors hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          <CopyIcon />
        </button>
      </div>

      <p role="status" aria-live="polite" className="mt-1 h-4 text-xs text-cyan-200">
        {isCopied ? '복사되었습니다.' : ''}
      </p>
    </RoomPanel>
  );
}
