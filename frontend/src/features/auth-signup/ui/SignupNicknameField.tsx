import { SIGNUP_COPY, NICKNAME_MAX_LENGTH } from '../config/signup';

interface SignupNicknameFieldProps {
  nickname: string;
  error: string | null;
  isConfirmed: boolean;
  onNicknameChange: (value: string) => void;
  onCheck: () => void;
}

export function SignupNicknameField({
  nickname,
  error,
  isConfirmed,
  onNicknameChange,
  onCheck,
}: SignupNicknameFieldProps) {
  return (
    <div className="space-y-3">
      <label htmlFor="nickname" className="block text-xs tracking-[0.08em] text-zinc-400">
        {SIGNUP_COPY.nicknameLabel}
      </label>

      <div className="flex gap-2">
        <input
          id="nickname"
          name="nickname"
          type="text"
          value={nickname}
          onChange={(event) => onNicknameChange(event.target.value)}
          placeholder={SIGNUP_COPY.nicknamePlaceholder}
          maxLength={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          className="h-[54px] min-w-0 flex-1 border border-zinc-700 bg-[#111111] px-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-neon-cyan"
        />
        <button
          type="button"
          onClick={onCheck}
          className="h-[54px] shrink-0 border border-white/[0.06] bg-[#202020] px-5 text-sm tracking-[0.08em] text-neon-cyan transition-colors hover:bg-[#292929] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan"
        >
          {SIGNUP_COPY.checkNickname}
        </button>
      </div>

      {isConfirmed ? (
        <p className="text-xs tracking-[0.08em] text-neon-cyan">
          ⊙ {SIGNUP_COPY.nicknameAvailable}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
