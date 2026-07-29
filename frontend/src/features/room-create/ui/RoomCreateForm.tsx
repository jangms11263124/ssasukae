'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { useRoomStore, type RoomMode } from '@/entities/room';
import { useAuth } from '@/entities/user';
import { ApiError } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { showToast } from '@/shared/model/toastStore';

import { useCreateRoomMutation } from '../api/useCreateRoomMutation';

const ROOM_MODES = [
  {
    description: '친구들과 자유롭게 노래하고 점수를 겨뤄요.',
    label: '일반전 모드',
    value: 'GENERAL',
  },
  {
    description: '팀원들과 함께 성을 지키는 특별 모드예요.',
    label: '수성전 모드',
    value: 'BATTLE',
  },
] satisfies Array<{
  description: string;
  label: string;
  value: RoomMode;
}>;

export function RoomCreateForm() {
  const router = useRouter();
  const { user } = useAuth();
  const enterRoom = useRoomStore((state) => state.enterRoom);
  const { mutate: createRoom, isPending } = useCreateRoomMutation();
  const [roomName, setRoomName] = useState('');
  const [mode, setMode] = useState<RoomMode>('GENERAL');

  const trimmedName = roomName.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode !== 'GENERAL' || trimmedName === '' || isPending) {
      return;
    }

    createRoom(
      { name: trimmedName, mode },
      {
        onSuccess: (response) => {
          enterRoom({
            roomId: response.roomId,
            participantId: response.participantId,
            inviteCode: response.inviteCode,
            name: trimmedName,
            mode,
            isHost: true,
            openViduSessionId: response.openViduSessionId,
            openViduToken: response.openViduToken,
            me: { userId: user?.id ?? 0, nickname: user?.nickname ?? '나' },
          });
          router.push(`/rooms/general?roomId=${response.roomId}`);
        },
        onError: (error) => {
          const message =
            error instanceof ApiError ? error.message : '방 생성에 실패했습니다.';
          showToast(message, 'error');
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <label htmlFor="room-name" className="text-sm font-semibold text-zinc-200">
          방 이름
        </label>
        <input
          id="room-name"
          value={roomName}
          onChange={(event) => setRoomName(event.target.value)}
          maxLength={20}
          placeholder="방 이름을 입력해 주세요"
          className="mt-3 h-12 w-full border border-white/15 bg-black/25 px-4 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-300/70"
        />
        <p className="mt-2 text-right font-mono text-[10px] text-zinc-600">
          {roomName.length}/20
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-zinc-200">모드 선택</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ROOM_MODES.map((roomMode) => {
            const isSelected = mode === roomMode.value;

            return (
              <label
                key={roomMode.value}
                className={cn(
                  'cursor-pointer border p-5 transition-colors',
                  isSelected
                    ? 'border-cyan-300/70 bg-cyan-300/8'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/25',
                )}
              >
                <input
                  type="radio"
                  name="room-mode"
                  value={roomMode.value}
                  checked={isSelected}
                  onChange={() => setMode(roomMode.value)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    'font-semibold',
                    isSelected ? 'text-cyan-200' : 'text-zinc-300',
                  )}
                >
                  {roomMode.label}
                </span>
                <span className="mt-2 block text-xs leading-5 text-zinc-500">
                  {roomMode.description}
                </span>
              </label>
            );
          })}
        </div>
        {mode === 'BATTLE' && (
          <p className="mt-3 text-xs text-amber-300/70">수성전 모드는 준비 중입니다.</p>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={mode !== 'GENERAL' || trimmedName === '' || isPending}
        className="h-12 w-full border border-cyan-300/60 bg-cyan-300/10 font-semibold text-cyan-100 transition-colors hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-zinc-600"
      >
        {isPending ? '방 만드는 중...' : '방 만들기'}
      </button>
    </form>
  );
}
