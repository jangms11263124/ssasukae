'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { RoomSummary } from '@/entities/room';
import { cn } from '@/shared/lib/cn';

import { RoomHeaderPopover } from './layout/RoomHeaderPopover';

const ROOM_MODE_LABEL = {
  BATTLE: '수성전 모드',
  GENERAL: '일반 모드',
} as const;

const COPIED_MS = 2200;

function CopyIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="1.6">
      <path d="M8.5 8.5h8v10h-8z" />
      <path d="M6 15.5H4.5v-10h8V7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="2">
      <path d="M5 12.5 9.5 17 19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H5a2 2 0 0 0 2 4M17 6h2a2 2 0 0 1-2 4" />
    </svg>
  );
}

function LeaveIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.6">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.6">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <circle cx="4" cy="14" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="20" cy="16" r="2" />
    </svg>
  );
}

interface RoomTopBarProps {
  activeParticipantCount: number;
  audioOpen: boolean;
  audioPanel?: ReactNode;
  leaderboardOpen: boolean;
  leaderboardPanel?: ReactNode;
  maxParticipants: number;
  onAudioClose: () => void;
  onCopyInviteCode: () => void | Promise<void>;
  onLeaderboardClose: () => void;
  onLeaveRoom: () => void;
  onParticipantsClose: () => void;
  onToggleAudio: () => void;
  onToggleLeaderboard: () => void;
  onToggleParticipants: () => void;
  participantsOpen: boolean;
  participantsPanel?: ReactNode;
  showAudioToggle: boolean;
  room: RoomSummary;
}

/**
 * 왼쪽 = 정체성(제목·모드) / 오른쪽 = 액션(초대코드·순위·나가기).
 */
export function RoomTopBar({
  activeParticipantCount,
  audioOpen,
  audioPanel,
  leaderboardOpen,
  leaderboardPanel,
  maxParticipants,
  onAudioClose,
  onCopyInviteCode,
  onLeaderboardClose,
  onLeaveRoom,
  onParticipantsClose,
  onToggleAudio,
  onToggleLeaderboard,
  onToggleParticipants,
  participantsOpen,
  participantsPanel,
  showAudioToggle,
  room,
}: RoomTopBarProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const participantsBtnRef = useRef<HTMLButtonElement>(null);
  const audioBtnRef = useRef<HTMLButtonElement>(null);
  const leaderboardBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopyInviteCode = async () => {
    await onCopyInviteCode();
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <header className="flex shrink-0 items-center justify-between gap-6 border-b border-white/10 bg-[#101012] px-4 py-2.5 sm:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <h1 className="truncate text-base font-semibold text-white">{room.name}</h1>
        <span className="shrink-0 rounded-full bg-cyan-400/15 px-2.5 py-0.5 text-[11px] font-medium text-cyan-200">
          {ROOM_MODE_LABEL[room.mode]}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => void handleCopyInviteCode()}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-all',
              copied
                ? 'border-emerald-400/40 bg-emerald-400/10'
                : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]',
            )}
            aria-label={
              copied
                ? `초대 코드 ${room.inviteCode}가 복사되었습니다`
                : `초대 코드 ${room.inviteCode} 복사`
            }
            title={copied ? '초대 코드가 복사되었습니다' : '클릭하면 초대 코드가 복사됩니다'}
          >
            <span
              className={cn(
                'text-[11px] font-medium',
                copied ? 'text-emerald-300/90' : 'text-zinc-500',
              )}
            >
              {copied ? '복사됨' : '초대코드'}
            </span>
            <span
              aria-hidden
              className={cn(
                'font-mono text-xs tracking-[0.16em]',
                copied ? 'text-emerald-100' : 'text-zinc-200',
              )}
            >
              {room.inviteCode}
            </span>
            <span
              className={cn(
                copied ? 'text-emerald-300' : 'text-zinc-500',
              )}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </span>
          </button>

          {copied ? (
            <span
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute right-0 top-full z-30 mt-1.5 whitespace-nowrap rounded-md border border-emerald-400/35 bg-[#0f1a14]/95 px-2.5 py-1 text-[11px] text-emerald-200 shadow-lg backdrop-blur-sm"
            >
              초대 코드가 복사되었습니다
            </span>
          ) : null}
        </div>

        <span aria-hidden className="hidden h-5 w-px bg-white/10 sm:block" />

        <div className="relative hidden lg:block">
          <button
            ref={participantsBtnRef}
            type="button"
            onClick={onToggleParticipants}
            aria-expanded={participantsOpen}
            aria-haspopup="dialog"
            aria-label={`참가자 ${activeParticipantCount}명`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
              participantsOpen
                ? 'bg-cyan-400/15 text-cyan-200'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
            )}
          >
            <UsersIcon />
            <span>
              참가자 {activeParticipantCount}/{maxParticipants}
            </span>
          </button>

          {participantsPanel ? (
            <RoomHeaderPopover
              open={participantsOpen}
              onClose={onParticipantsClose}
              anchorRef={participantsBtnRef}
              title={`참가자 ${activeParticipantCount}/${maxParticipants}`}
              widthClass="w-64"
            >
              {participantsPanel}
            </RoomHeaderPopover>
          ) : null}
        </div>

        {showAudioToggle ? (
          <div className="relative hidden lg:block">
            <button
              ref={audioBtnRef}
              type="button"
              onClick={onToggleAudio}
              aria-expanded={audioOpen}
              aria-haspopup="dialog"
              aria-label="오디오 설정"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                audioOpen
                  ? 'bg-cyan-400/15 text-cyan-200'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
              )}
            >
              <SlidersIcon />
              <span>오디오</span>
            </button>

            {audioPanel ? (
              <RoomHeaderPopover
                open={audioOpen}
                onClose={onAudioClose}
                anchorRef={audioBtnRef}
                title="오디오 설정"
                widthClass="w-72"
              >
                {audioPanel}
              </RoomHeaderPopover>
            ) : null}
          </div>
        ) : null}

        <div className="relative">
          <button
            ref={leaderboardBtnRef}
            type="button"
            onClick={onToggleLeaderboard}
            aria-expanded={leaderboardOpen}
            aria-haspopup="dialog"
            aria-label="리더보드 열기"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
              leaderboardOpen
                ? 'bg-cyan-400/15 text-cyan-200'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
            )}
          >
            <TrophyIcon />
            <span className="hidden sm:inline">순위</span>
          </button>

          {leaderboardPanel ? (
            <RoomHeaderPopover
              open={leaderboardOpen}
              onClose={onLeaderboardClose}
              anchorRef={leaderboardBtnRef}
              title="리더보드"
              widthClass="w-80"
              contentClassName="max-h-[min(24rem,calc(100dvh-6rem))] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {leaderboardPanel}
            </RoomHeaderPopover>
          ) : null}
        </div>

        <span aria-hidden className="hidden h-5 w-px bg-white/10 sm:block" />

        <button
          type="button"
          onClick={onLeaveRoom}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
            'text-red-400 hover:bg-red-950/40 hover:text-red-300',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400',
          )}
        >
          <LeaveIcon />
          방 나가기
        </button>
      </div>
    </header>
  );
}
