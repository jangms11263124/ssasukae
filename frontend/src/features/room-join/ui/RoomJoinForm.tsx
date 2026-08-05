'use client';

import {
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { buildRoomPath, useRoomStore, type RoomMode } from '@/entities/room';
import { useAuth } from '@/entities/user';
import { getApiErrorMessage } from '@/shared/api/getApiErrorMessage';
import { showToast } from '@/shared/model/toastStore';

import { useJoinRoomMutation } from '../api/useJoinRoomMutation';
import {
  INVITE_CODE_LENGTH,
  mapKeyCodeToInviteChar,
  sanitizeInviteCode,
} from '../lib/inviteCodeInput';
import { readInviteCodeFromSearch } from '../lib/inviteLink';

export function RoomJoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const enterRoom = useRoomStore((state) => state.enterRoom);
  const { mutate: joinRoom, isPending } = useJoinRoomMutation();
  const codeFromUrl = readInviteCodeFromSearch(searchParams.toString());
  const [manualInviteCode, setManualInviteCode] = useState<string | null>(null);
  const inviteCode = manualInviteCode ?? codeFromUrl;

  // 새 값을 DOM에 먼저 반영해 커서를 유지하고, React 상태를 뒤따라 맞춘다.
  const applyValue = (input: HTMLInputElement, next: string, cursor: number) => {
    if (input.value !== next) {
      input.value = next;
      const position = Math.min(cursor, next.length);
      input.setSelectionRange(position, position);
    }
    setManualInviteCode(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const char = mapKeyCodeToInviteChar(event.code);
    if (char) {
      event.preventDefault();
      const input = event.currentTarget;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const next = sanitizeInviteCode(
        input.value.slice(0, start) + char + input.value.slice(end),
      );
      applyValue(input, next, start + 1);
      return;
    }

    // 문자를 만들 수 있는 나머지 키(한글 조합 시작 포함)는 차단하고,
    // Backspace·Delete·방향키·Tab 같은 편집·이동 키는 그대로 둔다.
    if (event.key.length === 1 || event.key === 'Process') {
      event.preventDefault();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const input = event.currentTarget;
    const pasted = sanitizeInviteCode(event.clipboardData.getData('text'));
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = sanitizeInviteCode(
      input.value.slice(0, start) + pasted + input.value.slice(end),
    );
    applyValue(input, next, start + pasted.length);
  };

  // IME가 keydown 차단을 무시하고 조합 문자를 넣은 경우의 백스톱.
  // value를 직접 되돌려 조합을 중단시켜 한글이 남거나 중복 입력되지 않게 한다.
  const handleChange = (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const next = sanitizeInviteCode(input.value);
    applyValue(input, next, next.length);
  };

  const isComplete = inviteCode.length === INVITE_CODE_LENGTH;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isComplete || isPending) {
      return;
    }

    joinRoom(inviteCode, {
      onSuccess: ({ session, snapshot }) => {
        // 스냅샷을 못 받은 경우 GENERAL로 폴백 — 방 화면 부트스트랩이 다시 동기화한다.
        const mode: RoomMode = snapshot?.mode ?? 'GENERAL';
        enterRoom({
          roomId: session.roomId,
          participantId: session.participantId,
          inviteCode: session.inviteCode,
          name: snapshot?.name ?? '',
          mode,
          isHost: false,
          openViduSessionId: session.openViduSessionId,
          openViduToken: session.openViduToken,
          me: {
            userId: user?.id ?? 0,
            nickname: user?.nickname ?? '나',
            profileImageUrl: user?.profileImageUrl ?? null,
          },
        });
        router.push(buildRoomPath(mode, session.roomId));
      },
      onError: (error) => {
        showToast(getApiErrorMessage(error, '방에 입장하지 못했어요.'), 'error');
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <label htmlFor="invite-code" className="text-sm font-semibold text-zinc-200">
          초대 코드
        </label>
        <input
          id="invite-code"
          value={inviteCode}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          maxLength={INVITE_CODE_LENGTH}
          placeholder="6자리 코드를 입력해 주세요"
          className="mt-3 h-14 w-full border border-white/15 bg-black/25 px-4 text-center font-mono text-lg tracking-[0.3em] text-white uppercase outline-none transition-colors placeholder:text-sm placeholder:tracking-normal placeholder:text-zinc-600 focus:border-cyan-300/70"
        />
      </div>

      <button
        type="submit"
        disabled={!isComplete || isPending}
        className="h-12 w-full border border-cyan-300/60 bg-cyan-300/10 font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-zinc-600"
      >
        {isPending ? '입장 중...' : '방 참여하기'}
      </button>
    </form>
  );
}
