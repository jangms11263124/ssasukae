'use client';

import { useMemo, useState } from 'react';

import { anybody } from '@/shared/config/fonts';

import { convertKoreanKeyboardToEnglish } from '../lib/convertKoreanKeyboardToEnglish';

const INVITE_CODE_LENGTH = 6;

export function JoinRoomPanel() {
  const [inviteCode, setInviteCode] = useState('');

  const displayCode = useMemo(
    () => inviteCode.padEnd(INVITE_CODE_LENGTH, 'X').split(''),
    [inviteCode],
  );

  const handleCodeChange = (value: string) => {
    const normalizedCode = convertKoreanKeyboardToEnglish(value)
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, INVITE_CODE_LENGTH);

    setInviteCode(normalizedCode);
  };

  return (
    <section className={`${anybody.className} relative flex min-h-[31rem] flex-col border border-white/[0.08] bg-[linear-gradient(135deg,#242424_0%,#171717_65%,#111111_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-7`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_4px,rgba(255,255,255,0.012)_5px)]"
      />

      <div className="relative flex h-full flex-1 flex-col">
        <h2
          className="border-l-2 border-fuchsia-500 pl-4 text-lg font-bold tracking-tight text-zinc-100"
        >
          02 / JOIN_ROOM
        </h2>

        <label
          htmlFor="invite-code"
          className="mt-8 text-[0.58rem] font-bold tracking-[0.16em] text-zinc-500"
        >
          ENTER ACCESS CODE_
        </label>

        <div className="group relative mt-3 flex h-24 items-center justify-center overflow-hidden rounded-md border border-white/[0.05] bg-[#090b0f] pb-4 shadow-[inset_0_0_20px_rgba(0,0,0,0.65)] transition-[border-color,box-shadow] focus-within:border-cyan-400/70 focus-within:shadow-[inset_0_0_20px_rgba(0,0,0,0.65),0_0_14px_rgba(34,211,238,0.14)]">
          <input
            id="invite-code"
            type="text"
            value={inviteCode}
            onChange={(event) => handleCodeChange(event.target.value)}
            inputMode="text"
            pattern="[A-Za-z0-9]*"
            maxLength={INVITE_CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="invite-code-help"
            aria-label="영문과 숫자로 구성된 6자리 참여 코드"
            className="absolute inset-0 z-10 cursor-text opacity-0 outline-none"
          />
          <div
            aria-hidden="true"
            className="flex items-center gap-2 text-lg tracking-widest"
          >
            {displayCode.map((character, index) => (
              <span
                key={index}
                className={
                  index < inviteCode.length
                    ? 'border-b border-cyan-400 text-cyan-300'
                    : index === inviteCode.length
                      ? 'relative border-b border-cyan-300 text-zinc-500 after:absolute after:-left-1 after:top-1/2 after:h-5 after:w-px after:-translate-y-1/2 after:animate-pulse after:bg-cyan-300 after:opacity-0 group-focus-within:after:opacity-100'
                      : 'border-b border-zinc-500 text-zinc-500'
                }
              >
                {character}
              </span>
            ))}
          </div>

          <span className="absolute bottom-2 font-mono text-[0.48rem] tracking-[0.18em] text-zinc-700 group-focus-within:hidden">
            CLICK TO TYPE
          </span>
          <span className="absolute bottom-2 hidden items-center gap-1.5 font-mono text-[0.48rem] tracking-[0.18em] text-cyan-500 group-focus-within:flex">
            <span className="size-1 animate-pulse bg-cyan-400" aria-hidden="true" />
            INPUT_ACTIVE
          </span>
        </div>

        <p
          id="invite-code-help"
          className="mt-4 min-h-5 border-b border-white/[0.05] pb-4 text-[0.55rem] tracking-wide text-fuchsia-500"
        >
          {inviteCode.length > 0 && inviteCode.length < INVITE_CODE_LENGTH
            ? '△ [INVALID_CODE] 6자리 코드를 입력해 주세요.'
            : 'ACCESS_CHANNEL READY'}
        </p>

        <button
          type="button"
          disabled={inviteCode.length !== INVITE_CODE_LENGTH}
          className="mt-6 flex h-12 items-center justify-center gap-3 border border-zinc-500 bg-white/[0.03] text-sm font-bold text-zinc-100 transition-colors hover:border-cyan-300 hover:bg-cyan-300/[0.05] focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-zinc-500 disabled:hover:bg-white/[0.03]"
        >
          방 참여하기
          <span aria-hidden="true" className="font-mono text-base text-zinc-400">
            ↪
          </span>
        </button>

        <div className="mt-auto pt-12">
          <div
            className="flex items-center justify-between text-[0.55rem] tracking-wider text-zinc-600"
          >
            <span>LATENCY MONITOR</span>
            <span>12.4ms</span>
          </div>
          <div className="mt-4 flex h-6 items-end justify-center gap-1">
            {[8, 13, 7, 16, 11, 15].map((height, index) => (
              <span
                key={index}
                className="w-10 origin-bottom animate-[latency-wave_1.4s_ease-in-out_infinite] border border-white/10 bg-zinc-500/70 will-change-transform"
                style={{ height, animationDelay: `${index * 140}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
