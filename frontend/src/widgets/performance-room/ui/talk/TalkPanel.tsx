'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

import { cn } from '@/shared/lib/cn';

import { RoomPanel } from '../RoomPanel';

interface ChatMessage {
  id: number;
  mine: boolean;
  nickname?: string;
  text: string;
}

// 채팅 소켓이 붙기 전까지 사용하는 목업 대화.
const MOCK_MESSAGES: ChatMessage[] = [
  { id: 1, mine: false, nickname: '민석', text: '오 노래 잘 부르네 ㅋㅋ' },
  { id: 2, mine: false, nickname: '현호', text: '내가 더 잘 부를듯 ㅋㅋ' },
  { id: 3, mine: true, text: '아ㅋㅋㅋㅋ' },
];

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

export function TalkPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const nextIdRef = useRef(MOCK_MESSAGES.length + 1);

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

    setMessages((prev) => [...prev, { id: nextIdRef.current++, mine: true, text }]);
    setDraft('');
  };

  return (
    <RoomPanel className="flex h-full min-h-72 flex-col px-4 py-4">
      <h2 className="border-b border-white/15 pb-2 font-mono text-sm tracking-[0.18em]">
        <span className="text-cyan-200 underline decoration-cyan-300/70 underline-offset-4">
          TALK
        </span>
      </h2>

      <ul ref={listRef} className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto" aria-label="채팅 메시지">
        {messages.map((message) => (
          <li key={message.id} className={cn('flex', message.mine ? 'justify-end' : 'justify-start')}>
            <p
              className={cn(
                'max-w-[85%] break-words border px-2.5 py-1.5 text-xs',
                message.mine
                  ? 'border-white/10 border-r-2 border-r-cyan-300 bg-white/10 text-zinc-100'
                  : 'border-white/10 bg-white/5 text-zinc-300',
              )}
            >
              {message.nickname ? `${message.nickname}: ` : ''}
              {message.text}
            </p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="대화를 입력하세요"
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
