'use client';

import { NICKNAME_MAX_LENGTH } from '@/entities/user';
import { jetBrainsMono } from '@/shared/config/fonts';
import { cn } from '@/shared/lib/cn';

import { NICKNAME_EDIT_COPY, type NicknameCheckState } from '../model/useNicknameEdit';

interface NicknameFieldProps {
  nickname: string;
  checkState: NicknameCheckState;
  onNicknameChange: (value: string) => void;
  onCheck: () => void;
}

/**
 * 입력 아래 한 줄로 뜨는 확인 결과.
 * 회원가입과 동일하게 아직 확인하지 않은 상태에서는 아무것도 띄우지 않는다.
 */
function getStatusLine(checkState: NicknameCheckState) {
  switch (checkState.kind) {
    case 'available':
      return { tone: 'text-green-400', text: NICKNAME_EDIT_COPY.available, isAlert: false };
    case 'unchanged':
      return { tone: 'text-zinc-500', text: NICKNAME_EDIT_COPY.unchanged, isAlert: false };
    case 'error':
      return { tone: 'text-red-300', text: checkState.message, isAlert: true };
    case 'idle':
    case 'checking':
      return null;
  }
}

export function NicknameField({ nickname, checkState, onNicknameChange, onCheck }: NicknameFieldProps) {
  const isChecking = checkState.kind === 'checking';
  const status = getStatusLine(checkState);

  return (
    // 카드가 Anybody를 상속시키므로, 회원가입 폼과 같은 모노 맥락을 여기서 다시 씌운다.
    <div className={cn(jetBrainsMono.className, 'space-y-3')}>
      <label
        htmlFor="mypage-nickname"
        className="block text-xs tracking-[0.08em] text-zinc-400"
      >
        {NICKNAME_EDIT_COPY.label}
      </label>

      <div className="flex gap-2">
        <input
          id="mypage-nickname"
          name="nickname"
          type="text"
          value={nickname}
          onChange={(event) => onNicknameChange(event.target.value)}
          onKeyDown={(event) => {
            // 폼이 아니라 카드 안의 입력이라 Enter 기본 제출이 없다. 확인으로 연결한다.
            if (event.key === 'Enter') {
              event.preventDefault();
              onCheck();
            }
          }}
          placeholder={NICKNAME_EDIT_COPY.placeholder}
          maxLength={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          className="h-[54px] min-w-0 flex-1 border border-zinc-700 bg-[#111111] px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-neon-cyan"
        />

        <button
          type="button"
          onClick={onCheck}
          disabled={isChecking}
          className="h-[54px] shrink-0 border border-white/[0.06] bg-[#202020] px-5 text-sm tracking-[0.08em] text-neon-cyan transition-colors hover:bg-[#292929] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isChecking ? NICKNAME_EDIT_COPY.checking : NICKNAME_EDIT_COPY.check}
        </button>
      </div>

      {status ? (
        <p
          {...(status.isAlert ? { role: 'alert' } : { 'aria-live': 'polite' as const })}
          className={cn('text-xs', status.tone)}
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
