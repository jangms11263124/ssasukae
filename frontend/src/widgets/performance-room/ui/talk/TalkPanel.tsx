'use client';

import { useEffect, useRef, useState, type FormEvent, type PointerEventHandler } from 'react';

import { useRoomStore } from '@/entities/room';
import { cn } from '@/shared/lib/cn';

import { useChatStore, type ChatMessage } from '../../model/chatStore';
import { useRoomSocketContext } from '../../model/RoomSocketContext';
import { ParticipantAvatar } from '../ParticipantAvatar';

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
    // 무대를 가리지 않도록 패널 자체는 투명하다 — 타이틀 칩과 말풍선만 떠 있는 오버레이 채팅.
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 드래그 핸들. touch-none이 없으면 터치 드래그가 스크롤로 새어 나간다 */}
      <div
        {...dragHandleProps}
        className={cn(
          'flex shrink-0 items-center justify-between',
          dragHandleProps && 'cursor-grab touch-none select-none active:cursor-grabbing',
        )}
      >
        <h2 className="rounded-full border border-white/10 bg-black/55 px-3 py-1 font-mono text-xs tracking-[0.18em] backdrop-blur-sm">
          <span className="text-cyan-200">TALK</span>
        </h2>
        <button
          type="button"
          aria-label="채팅 닫기"
          onClick={onClose}
          className="grid size-6 place-items-center rounded-full bg-black/45 text-xs text-zinc-400 backdrop-blur-sm transition-colors hover:text-zinc-100"
        >
          ✕
        </button>
      </div>

      <ul
        ref={listRef}
        className={cn(
          'mt-2 min-h-0 flex-1 overflow-y-auto',
          // 위쪽 메시지는 서서히 사라져 무대와 자연스럽게 섞인다.
          '[mask-image:linear-gradient(to_bottom,transparent_0,black_2.5rem)]',
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
                  <span className="mb-1 truncate text-[11px] text-zinc-300 [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]">
                    {message.nickname}
                  </span>
                )}
                <p
                  className={cn(
                    'break-words rounded-xl px-3 py-1.5 text-xs backdrop-blur-sm',
                    mine
                      ? 'rounded-br-sm bg-cyan-400/20 text-cyan-50'
                      : 'rounded-bl-sm bg-black/45 text-zinc-200',
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
        className="mt-2 flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/55 py-1 pl-3 pr-1 backdrop-blur-sm"
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
          className="h-8 min-w-0 flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="메시지 전송"
          className="grid size-8 shrink-0 place-items-center rounded-full text-cyan-300 transition-colors hover:bg-cyan-400/10 hover:text-cyan-100"
        >
          <SendIcon />
        </button>
      </form>
    </section>
  );
}
