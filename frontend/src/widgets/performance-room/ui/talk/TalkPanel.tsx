'use client';

import { useEffect, useRef, useState, type FormEvent, type PointerEventHandler } from 'react';

import { useRoomStore } from '@/entities/room';
import { cn } from '@/shared/lib/cn';

import { useChatStore, type ChatMessage } from '../../model/chatStore';
import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { ParticipantAvatar } from '../ParticipantAvatar';
import { RoomPanel } from '../RoomPanel';

/** 백엔드 ParticipantChatRequest의 message 최대 길이 */
const MAX_MESSAGE_LENGTH = 300;

/**
 * 같은 사람이 이어서 보낸 메시지인지. 카톡처럼 첫 줄에만 프사·닉네임을 붙이고
 * 이어지는 줄은 말풍선만 남겨 목록이 얼굴로 뒤덮이지 않게 한다.
 */
function isSameSpeakerAsPrevious(messages: ChatMessage[], index: number): boolean {
  const previous = messages[index - 1];

  return previous !== undefined && previous.participantId === messages[index].participantId;
}

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M4 5.5 20 12 4 18.5V13l9-1-9-1z" />
    </svg>
  );
}

interface TalkPanelProps {
  /** 플로팅 채팅 독의 닫기. 헤더 ✕ 버튼이 호출한다 */
  onClose: () => void;
  /** 헤더를 드래그 핸들로 쓰는 포인터 핸들러 묶음. 플로팅 독(ChatPanelWindow)이 주입한다 */
  dragHandleProps?: {
    onPointerDown: PointerEventHandler<HTMLDivElement>;
    onPointerMove: PointerEventHandler<HTMLDivElement>;
    onPointerUp: PointerEventHandler<HTMLDivElement>;
    onPointerCancel: PointerEventHandler<HTMLDivElement>;
  };
}

export function TalkPanel({ onClose, dragHandleProps }: TalkPanelProps) {
  const messages = useChatStore((state) => state.messages);
  const myParticipantId = useRoomStore((state) => state.session?.myParticipantId ?? null);
  const socket = useRoomSocketContext();

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    // 내 메시지도 서버가 브로드캐스트한 PARTICIPANT_CHAT으로 목록에 반영된다.
    socket.sendChat(text);
    setDraft('');
  };

  return (
    <RoomPanel className="flex h-full min-h-0 flex-col overflow-hidden px-4 py-4">
      {/* 드래그 핸들. touch-none이 없으면 터치 드래그가 스크롤로 새어 나간다 */}
      <div
        {...dragHandleProps}
        className={cn(
          'flex shrink-0 items-center justify-between border-b border-white/15 pb-2',
          dragHandleProps && 'cursor-grab touch-none select-none active:cursor-grabbing',
        )}
      >
        <h2 className="font-mono text-sm tracking-[0.18em]">
          <span className="text-cyan-200 underline decoration-cyan-300/70 underline-offset-4">
            TALK
          </span>
        </h2>
        <button
          type="button"
          aria-label="채팅 닫기"
          onClick={onClose}
          className="grid size-6 place-items-center text-xs text-zinc-500 transition-colors hover:text-zinc-200"
        >
          ✕
        </button>
      </div>

      <ul
        ref={listRef}
        className={cn(
          'mt-3 min-h-0 flex-1 overflow-y-auto',
          // 스크롤은 가능하되 스크롤바는 숨긴다.
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
        )}
        aria-label="채팅 메시지"
      >
        {messages.map((message, index) => {
          const mine = message.participantId === myParticipantId;
          const grouped = isSameSpeakerAsPrevious(messages, index);

          return (
            <li
              key={message.id}
              className={cn(
                'flex gap-2',
                // 말한 사람이 바뀌는 자리에만 여백을 줘 덩어리로 읽히게 한다.
                grouped ? 'mt-0.5' : 'mt-2.5 first:mt-0',
                mine ? 'justify-end' : 'justify-start',
              )}
            >
              {mine ? null : grouped ? (
                // 프사 자리를 비워 두면 이어지는 말풍선이 위와 세로로 맞는다.
                <span aria-hidden="true" className="size-8 shrink-0" />
              ) : (
                <ParticipantAvatar
                  className="size-8"
                  nickname={message.nickname}
                  profileImageUrl={message.profileImageUrl}
                />
              )}

              <div className={cn('flex min-w-0 max-w-[80%] flex-col', mine && 'items-end')}>
                {mine || grouped ? null : (
                  <span className="mb-1 truncate text-[11px] text-zinc-400">
                    {message.nickname}
                  </span>
                )}
                <p
                  className={cn(
                    'break-words border px-2.5 py-1.5 text-xs',
                    mine
                      ? 'border-white/10 border-r-2 border-r-cyan-300 bg-white/10 text-zinc-100'
                      : 'border-white/10 bg-white/5 text-zinc-300',
                  )}
                >
                  {message.message}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <form
        onSubmit={handleSubmit}
        className="mt-3 flex shrink-0 items-center gap-2 border-t border-white/10 pt-3"
      >
        <input
          type="text"
          value={draft}
          // 플로팅 패널은 채팅하려고 연 것이므로 바로 입력할 수 있어야 한다.
          autoFocus
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="대화 입력"
          aria-label="채팅 입력"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="메시지 전송"
          className="shrink-0 text-cyan-300 transition-colors hover:text-cyan-100"
        >
          <SendIcon />
        </button>
      </form>
    </RoomPanel>
  );
}
