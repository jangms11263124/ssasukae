'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { RoomParticipant } from '@/entities/participant';
import { cn } from '@/shared/lib/cn';

import { ParticipantAvatar } from '../ParticipantAvatar';

function CrownIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 text-amber-300 drop-shadow-[0_0_4px_rgba(252,211,77,0.45)]"
    >
      <path d="M4 8l4 3.5L12 6l4 5.5L20 8l-1.6 9.5H5.6L4 8z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

interface SingerSelectModalProps {
  currentParticipantId: number;
  hostParticipantId: number;
  isSubmitting: boolean;
  maxParticipants?: number;
  onClose: () => void;
  onConfirm: () => void;
  onSelect: (participantId: number) => void;
  participants: RoomParticipant[];
  selectedId: number | null;
}

const DEFAULT_MAX_PARTICIPANTS = 4;
const SLOT_HEIGHT_CLASS = 'h-40';

function EmptySlot() {
  return (
    <div
      aria-hidden
      className={cn(
        'flex w-full items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 opacity-60',
        SLOT_HEIGHT_CLASS,
      )}
    >
      <span className="size-14 shrink-0 rounded-full border border-dashed border-white/15 bg-white/[0.03]" />
    </div>
  );
}

export function SingerSelectModal({
  currentParticipantId,
  hostParticipantId,
  isSubmitting,
  maxParticipants = DEFAULT_MAX_PARTICIPANTS,
  onClose,
  onConfirm,
  onSelect,
  participants,
  selectedId,
}: SingerSelectModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const selectableParticipants = participants.filter(
    ({ connectionStatus }) => connectionStatus === 'CONNECTED',
  );

  const gridSlots = Array.from({ length: maxParticipants }, (_, index) => {
    return selectableParticipants[index] ?? null;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <button
        type="button"
        aria-label="가창자 선택 닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/65"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-2xl border border-white/10 bg-[#161619] shadow-[0_40px_120px_rgba(0,0,0,0.65)]"
      >
        <div className="flex items-start justify-between px-7 pt-7">
          <div>
            <p className="font-mono text-sm tracking-[0.3em] text-cyan-300">
              STAGE_CONTROL / PERFORMER_SELECT
            </p>
            <h2
              id={titleId}
              className="mt-1.5 font-sans text-lg font-black uppercase italic tracking-tight text-white"
            >
              SELECT PERFORMER
            </h2>
            <p className="mt-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-cyan-200/80">
              <span aria-hidden="true" className="size-1.5 bg-cyan-300" />
              ASSIGNMENT_CHANNEL_ACTIVE
            </p>
            <p id={descriptionId} className="sr-only">
              이번 라운드의 가창자를 지정하세요
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid size-10 place-items-center border border-white/20 text-zinc-300 transition-colors hover:border-cyan-300/60 hover:text-cyan-200"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-7 py-5">
          <ul className="grid grid-cols-2 gap-3">
            {gridSlots.map((participant, index) => {
              if (participant === null) {
                return (
                  <li key={`empty-${index}`}>
                    <EmptySlot />
                  </li>
                );
              }

              const isSelected = selectedId === participant.id;
              const isCurrentUser = participant.id === currentParticipantId;
              const isHost = participant.id === hostParticipantId;

              return (
                <li key={participant.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(participant.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'relative flex w-full items-center justify-center rounded-lg border px-4 transition-all',
                      SLOT_HEIGHT_CLASS,
                      isSelected
                        ? 'border-cyan-300/70 bg-cyan-400/10 shadow-[0_0_24px_rgba(103,232,249,0.18)]'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]',
                    )}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <ParticipantAvatar
                        className="size-14 shrink-0"
                        nickname={participant.nickname}
                        profileImageUrl={participant.profileImageUrl}
                      />
                      <p className="inline-flex max-w-full min-h-5 items-center justify-center gap-1.5">
                        {isHost ? <CrownIcon /> : null}
                        <span
                          className={cn(
                            'truncate text-sm font-medium',
                            isCurrentUser ? 'text-fuchsia-300' : 'text-zinc-200',
                          )}
                        >
                          {participant.nickname}
                          {isCurrentUser ? ' (나)' : ''}
                        </span>
                      </p>
                    </div>
                    {isSelected ? (
                      <span className="absolute inset-x-0 bottom-3 text-center text-[10px] tracking-[0.18em] text-cyan-300">
                        SELECTED
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex justify-center gap-2 border-t border-white/10 px-7 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border border-white/15 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/5"
          >
            취소
          </button>
          <button
            type="button"
            disabled={selectedId === null || isSubmitting}
            onClick={onConfirm}
            className="border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? '지정 중...' : '시작하기'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
