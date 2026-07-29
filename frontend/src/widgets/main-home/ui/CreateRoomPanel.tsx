'use client';

import { useState } from 'react';

import { anybody } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

type RoomMode = 'NORMAL' | 'FORTRESS';

const ROOM_MODES = [
  {
    id: 'NORMAL' as const,
    badge: 'DEFAULT_MODE',
    title: '일반 모드',
    description: '고른 곡을 자유롭게\n즐길 수 있어요.',
  },
  {
    id: 'FORTRESS' as const,
    badge: 'BATTLE_MODE',
    title: '수성전 모드',
    description: '공격과 수비로 진행하는\n몰입감 높은 모드예요.',
  },
];

export function CreateRoomPanel() {
  const [roomName, setRoomName] = useState('');
  const [selectedMode, setSelectedMode] = useState<RoomMode>('FORTRESS');

  return (
    <section className={`${anybody.className} relative flex min-h-[31rem] flex-col border border-white/[0.08] bg-[linear-gradient(135deg,#242424_0%,#171717_62%,#111111_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-7`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_4px,rgba(255,255,255,0.012)_5px)]"
      />

      <div className="relative flex h-full flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <h2
            className="border-l-2 border-cyan-400 pl-4 text-lg font-bold tracking-tight text-zinc-100"
          >
            01 / CREATE_ROOM
          </h2>
          <span
            className="hidden text-[0.55rem] tracking-wider text-zinc-700 sm:block"
          >
            REF_ID: CR_000_77
          </span>
        </div>

        <label
          htmlFor="room-name"
          className="mt-8 text-[0.58rem] font-bold tracking-[0.16em] text-zinc-500"
        >
          ROOM NAME_
        </label>
        <input
          id="room-name"
          value={roomName}
          onChange={(event) => setRoomName(event.target.value)}
          maxLength={30}
          placeholder="ENTER_STATION_NAME"
          className="mt-3 h-11 border border-white/10 bg-black/20 px-4 text-xs tracking-wider text-zinc-100 outline-none transition-colors placeholder:text-zinc-700 focus:border-cyan-400/70"
        />

        <fieldset className="mt-8">
          <legend
            className="text-[0.58rem] font-bold tracking-[0.16em] text-zinc-500"
          >
            EXPERIENCE MODE_
          </legend>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ROOM_MODES.map((mode) => {
              const isSelected = selectedMode === mode.id;

              return (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedMode(mode.id)}
                  className={cn(
                    'relative min-h-36 border bg-black/10 p-4 text-left transition-[border-color,background-color,opacity] focus-visible:outline-2 focus-visible:outline-cyan-300',
                    isSelected
                      ? 'border-cyan-400 bg-cyan-400/[0.035] opacity-100 shadow-[inset_0_0_20px_rgba(34,211,238,0.025)]'
                      : 'border-white/[0.07] opacity-45 hover:border-white/20 hover:opacity-80',
                  )}
                >
                  <span
                    className={`border border-current px-2 py-0.5 text-[0.48rem] tracking-wider ${isSelected ? 'text-cyan-400' : 'text-zinc-500'}`}
                  >
                    {mode.badge}
                  </span>
                  <strong className="mt-6 block text-xl font-bold text-zinc-100">{mode.title}</strong>
                  <span className="mt-2 block whitespace-pre-line text-xs leading-relaxed text-zinc-500">
                    {mode.description}
                  </span>

                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute right-3 top-3 flex size-4 items-center justify-center rounded-full border border-cyan-400 text-[0.45rem] text-cyan-300"
                    >
                      ●
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        <button
          type="button"
          className="mt-7 flex h-12 items-center justify-center gap-3 border border-zinc-500 bg-white/[0.03] text-sm font-bold text-zinc-100 transition-colors hover:border-cyan-300 hover:bg-cyan-300/[0.05] focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          방 만들기
          <span aria-hidden="true" className="font-mono text-base text-zinc-400">
            ◫
          </span>
        </button>
      </div>
    </section>
  );
}
